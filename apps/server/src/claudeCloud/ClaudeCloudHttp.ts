import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Sse from "effect/encoding/Sse";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

// Internal claude.ai/code endpoints, read from the Claude Code CLI (2.1.318). Undocumented.
export const API_ROOT = "https://api.anthropic.com";
export const API_BASE = `${API_ROOT}/v1/code/sessions`;
// The stream sends a keepalive comment well within this; silence means a dead connection.
const STREAM_SILENCE_LIMIT = Duration.seconds(90);

/** One claude.ai login: a Claude home directory and the CLI's account metadata file. */
export interface ClaudeAccountRef {
  readonly configDir: string;
  readonly accountFile: string;
}

const ClaudeCredentials = Schema.Struct({
  claudeAiOauth: Schema.Struct({ accessToken: Schema.String }),
});
const ClaudeAccount = Schema.Struct({
  oauthAccount: Schema.optional(
    Schema.Struct({ organizationUuid: Schema.optional(Schema.String) }),
  ),
});

export class ClaudeCloudSessionsError extends Schema.TaggedError<ClaudeCloudSessionsError>()(
  "ClaudeCloudSessionsError",
  { operation: Schema.String, cause: Schema.Defect() },
) {}
const isClaudeCloudSessionsError = Schema.is(ClaudeCloudSessionsError);

const toCloudError = (operation: string) => (cause: unknown) =>
  isClaudeCloudSessionsError(cause) ? cause : new ClaudeCloudSessionsError({ operation, cause });

export const makeClaudeCloudHttp = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);

  // Read on every request so the CLI stays the only writer and refresher of the token.
  const authHeaders = Effect.fn("ClaudeCloudHttp.authHeaders")(
    function* (account: ClaudeAccountRef) {
      const credentials = yield* fileSystem
        .readFileString(`${account.configDir}/.credentials.json`)
        .pipe(Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudeCredentials))));
      const metadata = yield* fileSystem
        .readFileString(account.accountFile)
        .pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(ClaudeAccount))),
          Effect.option,
        );
      const organization = Option.flatMap(metadata, (value) =>
        Option.fromNullishOr(value.oauthAccount?.organizationUuid),
      );
      return {
        Authorization: `Bearer ${credentials.claudeAiOauth.accessToken}`,
        "anthropic-version": "2023-06-01",
        ...(Option.isSome(organization) ? { "x-organization-uuid": organization.value } : {}),
      };
    },
    Effect.mapError(
      (cause) => new ClaudeCloudSessionsError({ operation: "read-credentials", cause }),
    ),
  );

  const getJson = <S extends Schema.Top>(
    account: ClaudeAccountRef,
    url: string,
    schema: S,
    operation: string,
  ) =>
    authHeaders(account).pipe(
      Effect.flatMap((headers) =>
        HttpClientRequest.get(url).pipe(HttpClientRequest.setHeaders(headers), httpClient.execute),
      ),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.timeout(Duration.seconds(30)),
      Effect.mapError(toCloudError(operation)),
    );

  const postRaw = (account: ClaudeAccountRef, url: string, body: unknown) =>
    authHeaders(account).pipe(
      Effect.flatMap((headers) =>
        HttpClientRequest.post(url).pipe(
          HttpClientRequest.setHeaders(headers),
          HttpClientRequest.bodyJsonUnsafe(body),
          httpClient.execute,
        ),
      ),
    );

  const post = (account: ClaudeAccountRef, url: string, body: unknown, operation: string) =>
    postRaw(account, url, body).pipe(
      Effect.timeout(Duration.seconds(30)),
      Effect.asVoid,
      Effect.mapError(toCloudError(operation)),
    );

  const postJson = <S extends Schema.Top>(
    account: ClaudeAccountRef,
    url: string,
    body: unknown,
    schema: S,
    operation: string,
  ) =>
    postRaw(account, url, body).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.timeout(Duration.seconds(30)),
      Effect.mapError(toCloudError(operation)),
    );

  /** A session's SSE event names, live from after `afterSequence` (sent as `Last-Event-ID`). */
  const eventNames = (account: ClaudeAccountRef, sessionId: string, afterSequence: number) =>
    Stream.unwrap(
      authHeaders(account).pipe(
        Effect.flatMap((headers) =>
          HttpClientRequest.get(`${API_BASE}/${encodeURIComponent(sessionId)}/events/stream`).pipe(
            HttpClientRequest.setHeaders({
              ...headers,
              accept: "text/event-stream",
              "last-event-id": String(afterSequence),
            }),
            httpClient.execute,
          ),
        ),
        Effect.map((response) =>
          response.stream.pipe(
            Stream.timeoutOrElse({
              duration: STREAM_SILENCE_LIMIT,
              orElse: () => Stream.fail(new Error("Claude cloud event stream went silent")),
            }),
            Stream.decodeText,
            Stream.pipeThroughChannel(Sse.decode()),
            Stream.map((event) => event.event),
          ),
        ),
      ),
    ).pipe(Stream.mapError(toCloudError("event-stream")));

  return { eventNames, getJson, post, postJson, toCloudError };
});

/** Posts one event the way the Claude CLI does: `{events: [{payload}]}`. */
export const eventsBody = (payload: unknown) => ({ events: [{ payload }] });
