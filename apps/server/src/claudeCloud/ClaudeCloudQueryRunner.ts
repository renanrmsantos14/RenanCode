import type { PermissionResult, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { CLAUDE_CLOUD_THREAD_ID_PREFIX, isClaudeCloudThreadId } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import {
  ClaudeAgentSdkQueryRunnerError,
  type ClaudeAgentSdkQueryRunnerShape,
  type ClaudeAgentSdkQuerySession,
} from "../orchestration-v2/Adapters/ClaudeAdapterV2.ts";
import {
  API_BASE,
  eventsBody,
  makeClaudeCloudHttp,
  type ClaudeAccountRef,
} from "./ClaudeCloudHttp.ts";

const POLL_INTERVAL = Duration.seconds(1);
const EVENT_PAGE_LIMIT = 200;

// Frames the Claude adapter understands; the cloud also streams its own housekeeping
// (env_manager_log, autocompact_state, worker events) that a local SDK never emits.
const SDK_FRAME_TYPES = new Set([
  "system",
  "assistant",
  "user",
  "result",
  "stream_event",
  "rate_limit_event",
  "tool_progress",
  "tool_use_summary",
]);

const CloudEvent = Schema.Struct({
  sequence_num: Schema.Union([Schema.String, Schema.Number]),
  payload: Schema.optional(Schema.Unknown),
});
const CloudEventPage = Schema.Struct({
  data: Schema.Array(CloudEvent),
  next_cursor: Schema.optional(Schema.NullOr(Schema.String)),
});

interface CloudControlRequest {
  readonly type: "control_request";
  readonly request_id: string;
  readonly request: {
    readonly subtype?: string;
    readonly tool_name?: string;
    readonly input?: Record<string, unknown>;
    readonly tool_use_id?: string;
    readonly permission_suggestions?: unknown;
  };
}

const runnerError = (method: string) => (cause: unknown) =>
  new ClaudeAgentSdkQueryRunnerError({ method, cause });

const notSupported = (method: string) =>
  Effect.fail(
    new ClaudeAgentSdkQueryRunnerError({
      method,
      cause: "Not available for Claude cloud sessions.",
    }),
  );

/** True for frames the adapter should translate, as opposed to cloud-only housekeeping. */
export function isClaudeSdkFrame(payload: unknown): payload is SDKMessage {
  const type = (payload as { readonly type?: unknown } | null)?.type;
  return typeof type === "string" && SDK_FRAME_TYPES.has(type);
}

export function isCanUseToolRequest(payload: unknown): payload is CloudControlRequest {
  const value = payload as Partial<CloudControlRequest> | null;
  return (
    value?.type === "control_request" &&
    typeof value.request_id === "string" &&
    value.request?.subtype === "can_use_tool" &&
    typeof value.request.tool_name === "string"
  );
}

/**
 * Runs Claude cloud threads through the regular Claude adapter: the cloud session stands in
 * for the local SDK process, so runs, tool items, approvals and Stop work as they do locally.
 */
export const makeClaudeCloudQueryRunner = Effect.fn("makeClaudeCloudQueryRunner")(function* (
  account: ClaudeAccountRef,
) {
  const http = yield* makeClaudeCloudHttp;
  const random = yield* SecureRandom.SecureRandom;

  const latestSequence = (sessionId: string) =>
    http
      .getJson(
        account,
        `${API_BASE}/${encodeURIComponent(sessionId)}/events?sort_order=desc&limit=1`,
        CloudEventPage,
        "latest-event",
      )
      .pipe(Effect.map((page) => Number(page.data[0]?.sequence_num ?? 0)));

  const eventsAfter = Effect.fn("ClaudeCloudQueryRunner.eventsAfter")(function* (
    sessionId: string,
    afterSequence: number,
  ) {
    const events: Array<typeof CloudEvent.Type> = [];
    let cursor: string | null | undefined;
    let reachedSeen = false;
    do {
      const query = new URLSearchParams({ sort_order: "desc", limit: String(EVENT_PAGE_LIMIT) });
      if (cursor) query.set("cursor", cursor);
      const page = yield* http.getJson(
        account,
        `${API_BASE}/${encodeURIComponent(sessionId)}/events?${query}`,
        CloudEventPage,
        "list-events",
      );
      for (const event of page.data) {
        if (Number(event.sequence_num) <= afterSequence) {
          reachedSeen = true;
          break;
        }
        events.push(event);
      }
      cursor = reachedSeen || page.data.length === 0 ? null : page.next_cursor;
    } while (cursor);
    return events.reverse();
  });

  const postEvent = (sessionId: string, payload: unknown, operation: string) =>
    http.post(
      account,
      `${API_BASE}/${encodeURIComponent(sessionId)}/events`,
      eventsBody(payload),
      operation,
    );

  const open: ClaudeAgentSdkQueryRunnerShape["open"] = Effect.fn("ClaudeCloudQueryRunner.open")(
    function* (input) {
      const sessionId = input.threadId.startsWith(CLAUDE_CLOUD_THREAD_ID_PREFIX)
        ? input.threadId.slice(CLAUDE_CLOUD_THREAD_ID_PREFIX.length)
        : input.threadId;
      const messages = yield* Queue.unbounded<SDKMessage, ClaudeAgentSdkQueryRunnerError>();
      const canUseTool = input.options.canUseTool;

      const answerPermission = (request: CloudControlRequest) =>
        random.uuidV4().pipe(
          Effect.flatMap((responseUuid) =>
            Effect.tryPromise({
              try: (signal) =>
                canUseTool === undefined
                  ? Promise.resolve<PermissionResult>({
                      behavior: "deny",
                      message: "T3 cannot answer this request.",
                    })
                  : canUseTool(request.request.tool_name ?? "", request.request.input ?? {}, {
                      signal,
                      requestId: request.request_id,
                      toolUseID: request.request.tool_use_id ?? request.request_id,
                      ...(Array.isArray(request.request.permission_suggestions)
                        ? { suggestions: request.request.permission_suggestions }
                        : {}),
                    }),
              catch: runnerError("canUseTool"),
            }).pipe(
              Effect.flatMap((response) =>
                postEvent(
                  sessionId,
                  {
                    uuid: responseUuid,
                    type: "control_response",
                    response: { subtype: "success", request_id: request.request_id, response },
                  },
                  "permission-response",
                ),
              ),
            ),
          ),
          Effect.catch((cause) =>
            Effect.logWarning("Could not answer a Claude cloud permission request", { cause }),
          ),
        );

      // Start after what already happened: history is the mirror's job, not this turn's.
      let seen = yield* latestSequence(sessionId).pipe(Effect.mapError(runnerError("open")));
      const poll = Effect.gen(function* () {
        const events = yield* eventsAfter(sessionId, seen);
        for (const event of events) {
          seen = Math.max(seen, Number(event.sequence_num));
          if (isCanUseToolRequest(event.payload)) {
            yield* Effect.forkDetach(answerPermission(event.payload));
          } else if (isClaudeSdkFrame(event.payload)) {
            yield* Queue.offer(messages, event.payload);
          }
        }
      }).pipe(
        Effect.catch((cause) =>
          Effect.logWarning("Claude cloud event poll failed", { sessionId, cause }),
        ),
        Effect.andThen(Effect.sleep(POLL_INTERVAL)),
        Effect.forever,
      );
      const poller = yield* Effect.forkDetach(poll);

      const session: ClaudeAgentSdkQuerySession = {
        messages: Stream.fromQueue(messages),
        offer: (message: SDKUserMessage, onQueued?: () => void) =>
          postEvent(sessionId, { ...message, session_id: sessionId }, "send-message").pipe(
            Effect.tap(() => Effect.sync(() => onQueued?.())),
            Effect.mapError(runnerError("offer")),
          ),
        interrupt: Effect.all([random.uuidV4(), random.uuidV4()]).pipe(
          Effect.flatMap(([uuid, requestId]) =>
            postEvent(
              sessionId,
              {
                uuid,
                type: "control_request",
                request_id: requestId,
                request: { subtype: "interrupt" },
              },
              "interrupt",
            ),
          ),
          Effect.mapError(runnerError("interrupt")),
        ),
        // The cloud session owns its model, settings and permission mode.
        setModel: () => Effect.void,
        applyFlagSettings: () => Effect.void,
        setPermissionMode: () => Effect.void,
        mcpServerStatus: Effect.succeed([]),
        toggleMcpServer: () => notSupported("toggleMcpServer"),
        stopTask: () => notSupported("stopTask"),
        backgroundTasks: () => Effect.succeed(false),
        readMcpResource: () => notSupported("readMcpResource"),
        callMcpTool: () => notSupported("callMcpTool"),
        listPermissionRules: Effect.succeed([]),
        close: Fiber.interrupt(poller).pipe(Effect.andThen(Queue.shutdown(messages))),
      };
      return session;
    },
  );

  return { open };
});

/** Sends cloud threads to the cloud runner and every other thread to the local SDK runner. */
export function routeClaudeQueryRunner(
  local: ClaudeAgentSdkQueryRunnerShape,
  cloud: Pick<ClaudeAgentSdkQueryRunnerShape, "open">,
): ClaudeAgentSdkQueryRunnerShape {
  return {
    ...local,
    open: (input) =>
      isClaudeCloudThreadId(input.threadId) ? cloud.open(input) : local.open(input),
  };
}
