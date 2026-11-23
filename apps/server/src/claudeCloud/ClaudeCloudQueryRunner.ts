import type { PermissionResult, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  CLAUDE_CLOUD_THREAD_ID_PREFIX,
  isClaudeCloudThreadId,
  isProviderSendTurnSupportedImageMimeType,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
} from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { withInlineAttachmentNotices } from "@t3tools/provider-core/server/attachmentPrompt";
import { MAX_TOOL_OUTPUT_IMAGES } from "@t3tools/shared/toolOutput";

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

const ClaudeSettingsLanguage = Schema.Struct({ language: Schema.optional(Schema.String) });

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

/**
 * Cloud frames carry the CLI's own session id. The adapter adopts a different id as a /clear
 * and then cannot reuse this query, so the next send replaces it, which background agents block.
 */
export function withNativeSessionId(frame: SDKMessage, nativeSessionId: string): SDKMessage {
  return "session_id" in frame && frame.session_id !== nativeSessionId
    ? { ...frame, session_id: nativeSessionId }
    : frame;
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

export interface SentFileImage {
  readonly fileUuid: string;
  readonly mediaType: string;
}

const SendUserFileResult = Schema.Struct({
  attachments: Schema.Array(
    Schema.Struct({
      file_uuid: Schema.String,
      isImage: Schema.optional(Schema.Boolean),
      media_type: Schema.String,
      size: Schema.optional(Schema.Number),
    }),
  ),
});
const decodeSendUserFileResult = Schema.decodeUnknownOption(SendUserFileResult);

/**
 * Images a SendUserFile result names; the cloud stores their bytes, not the tool result.
 * None when one cannot be shown, since the timeline pairs each image with its path by position.
 */
export function sentFileImages(frame: SDKMessage): ReadonlyArray<SentFileImage> {
  if (frame.type !== "user") return [];
  const result = decodeSendUserFileResult(frame.tool_use_result);
  if (result._tag === "None") return [];
  const images = result.value.attachments;
  const showable =
    images.length <= MAX_TOOL_OUTPUT_IMAGES &&
    images.every(
      (image) =>
        image.isImage === true &&
        isProviderSendTurnSupportedImageMimeType(image.media_type) &&
        (image.size ?? 0) <= PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
    );
  return showable
    ? images.map((image) => ({ fileUuid: image.file_uuid, mediaType: image.media_type }))
    : [];
}

/** Puts the sent images into the tool result, where the Read tool's images already show. */
export function withSentFileImages(
  frame: SDKMessage,
  images: ReadonlyArray<SentFileImage & { readonly base64: string }>,
): SDKMessage {
  if (frame.type !== "user" || images.length === 0) return frame;
  const content = frame.message.content;
  if (typeof content === "string") return frame;
  const blocks = images.map((image) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: image.mediaType, data: image.base64 },
  }));
  return {
    ...frame,
    message: {
      ...frame.message,
      content: content.map((block) =>
        block.type !== "tool_result"
          ? block
          : {
              ...block,
              content: [
                ...(typeof block.content === "string"
                  ? [{ type: "text" as const, text: block.content }]
                  : (block.content ?? [])),
                ...blocks,
              ],
            },
      ),
    },
  } as SDKMessage;
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
  const fileSystem = yield* FileSystem.FileSystem;

  // The cloud VM has none of this machine's Claude settings, so it cannot know the reply language.
  const languageOf = fileSystem.readFileString(`${account.configDir}/settings.json`).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudeSettingsLanguage))),
    Effect.map((settings) => settings.language?.trim() || undefined),
    Effect.orElseSucceed(() => undefined),
  );

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

  // One failed download drops every preview (the tool result still names the files): the
  // timeline pairs each image with its path by position.
  const withDownloadedSentFiles = (frame: SDKMessage) =>
    Effect.forEach(
      sentFileImages(frame),
      (image) =>
        http.fileBytes(account, image.fileUuid).pipe(
          Effect.filterOrFail((bytes) => bytes.byteLength <= PROVIDER_SEND_TURN_MAX_IMAGE_BYTES),
          Effect.map((bytes) => ({ ...image, base64: Buffer.from(bytes).toString("base64") })),
        ),
      { concurrency: 4 },
    ).pipe(
      Effect.map((images) => withSentFileImages(frame, images)),
      Effect.catch((cause) =>
        Effect.logWarning("Could not download a Claude cloud sent file", { cause }).pipe(
          Effect.as(frame),
        ),
      ),
    );

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
      const language = yield* languageOf;
      const canUseTool = input.options.canUseTool;
      const nativeSessionId = input.options.resume ?? input.options.sessionId ?? sessionId;

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
            const frame = yield* withDownloadedSentFiles(event.payload);
            yield* Queue.offer(messages, withNativeSessionId(frame, nativeSessionId));
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
          postEvent(
            sessionId,
            { ...forCloudVm(message, language), session_id: sessionId },
            "send-message",
          ).pipe(
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
        renameSession: () => Effect.void,
        mcpServerStatus: Effect.succeed([]),
        toggleMcpServer: () => notSupported("toggleMcpServer"),
        stopTask: () => notSupported("stopTask"),
        backgroundTasks: () => Effect.succeed(false),
        readMcpResource: () => notSupported("readMcpResource"),
        mcpAuthenticate: () => notSupported("mcpAuthenticate"),
        mcpSubmitOAuthCallbackUrl: () => notSupported("mcpSubmitOAuthCallbackUrl"),
        reconnectMcpServer: () => notSupported("reconnectMcpServer"),
        callMcpTool: () => notSupported("callMcpTool"),
        listPermissionRules: Effect.succeed([]),
        close: Fiber.interrupt(poller).pipe(Effect.andThen(Queue.shutdown(messages))),
      };
      return session;
    },
  );

  return { open };
});

export function forCloudVm(message: SDKUserMessage, language?: string): SDKUserMessage {
  const content = message.message.content;
  // A slash command must stay the message's only text to run as a command.
  const firstText =
    typeof content === "string" ? content : content.find((block) => block.type === "text")?.text;
  const isCommand = firstText !== undefined && /^\/[\w:-]+(\s|$)/.test(firstText);
  const reminderLanguage = isCommand ? undefined : language;
  if (typeof content === "string" && reminderLanguage === undefined) return message;
  const blocks =
    typeof content === "string"
      ? [{ type: "text" as const, text: content }]
      : content.map((block) =>
          block.type === "text"
            ? { ...block, text: withInlineAttachmentNotices(block.text) }
            : block,
        );
  const reminder = `<system-reminder>Always respond in ${reminderLanguage}.</system-reminder>`;
  return {
    ...message,
    message: {
      ...message.message,
      content:
        reminderLanguage === undefined ? blocks : [...blocks, { type: "text", text: reminder }],
    },
  };
}

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
