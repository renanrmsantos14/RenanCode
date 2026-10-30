import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  EventId,
  MessageId,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  RunId,
  ThreadId,
  type TurnItemId,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";

import * as ServerConfig from "../config.ts";
import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as CommandReceiptStore from "../orchestration-v2/CommandReceiptStore.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProviderContinuationRequests from "@t3tools/provider-core/server/ProviderContinuationRequests";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import * as ProviderReplayHarness from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import * as PeerForwarding from "../peer/PeerForwarding.ts";
import * as PeerLinkRequests from "../peer/PeerLinkRequests.ts";
import { descriptorOf, layerLinkingEnvironment } from "../peer/PeerLinks.testkit.ts";
import * as RemoteDelegation from "../peer/RemoteDelegation.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ScheduledTaskService from "../scheduledTasks/ScheduledTaskService.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as GitVcsDriver from "../vcs/GitVcsDriver.ts";
import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";

// The agent asks the user to switch on an MCP server its thread has off. A
// real orchestrator and the real orchestrator toolkit; the user's answer is
// the client command the card sends.

const environment = descriptorOf("environment-mcp", "Here");
const instanceId = ProviderInstanceId.make("codex");
const driver = ProviderDriverKind.make("codex");
const modelSelection = { instanceId, model: "gpt-5.4" };
const threadId = ThreadId.make("thread:mcp");
const runId = RunId.make("run:mcp");
const rootNode = NodeId.make("node:mcp:root");
const spotify = "claude.ai Spotify";

const adapter = {
  instanceId,
  driver,
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("No provider process needed"),
} as ProviderAdapter.ProviderAdapterV2["Service"];

const mcpClient = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "mcp-server-request", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-server-request", version: "1" },
  },
  getClient: Effect.die("unused"),
});

const scope: McpInvocationContext.McpInvocationScope = {
  environmentId: environment.environmentId,
  requestNamespace: "provider-session:mcp",
  thread: {
    threadId,
    providerSessionId: "provider-session:mcp",
    providerInstanceId: instanceId,
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

const makeHere = Effect.gen(function* () {
  // The toolkit's link tools need a linking environment, unused here.
  const linking = yield* layerLinkingEnvironment(environment).pipe(Layer.build);
  const database = yield* SqlitePersistence.layerMemory.pipe(Layer.build);
  const layerDatabase = Layer.succeedContext(database);
  const layerOrchestrator = Layer.mergeAll(
    layerDatabase,
    ProjectionStore.layer.pipe(Layer.provide(layerDatabase)),
    ProviderReplayHarness.layerWithRegistry(
      { name: "mcp-server-request" },
      ProviderAdapterRegistry.layerFromAdapters([adapter]),
      { databaseLayer: layerDatabase, runEffectWorker: false },
    ),
  ).pipe(
    Layer.provide(
      Layer.succeed(ProviderContinuationRequests.ProviderContinuationRequests, {
        offer: () => Effect.void,
        take: Effect.never,
      }),
    ),
  );
  const layerThreads = ThreadManagement.layer.pipe(
    Layer.provide(CommandReceiptStore.layer.pipe(Layer.provide(layerDatabase))),
    Layer.provideMerge(Layer.merge(layerOrchestrator, ServerSettings.layerTest())),
  );
  const layerHere = McpHttpServer.layerOrchestratorToolkit.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provide(PeerLinkRequests.layer),
    Layer.provide(Layer.mock(PeerForwarding.PeerForwarding)({})),
    Layer.provide(Layer.mock(RemoteDelegation.RemoteDelegation)({})),
    Layer.provide(Layer.succeedContext(linking)),
    Layer.provide(NodeCrypto.layer),
    Layer.provideMerge(layerThreads),
    Layer.provide(Layer.mock(ProviderRegistry.ProviderRegistry)({})),
    Layer.provide(Layer.mock(ProviderAdapterRegistry.ProviderAdapterRegistryV2)({})),
    Layer.provide(Layer.mock(ScheduledTaskService.ScheduledTaskService)({})),
    Layer.provide(Layer.mock(ProjectService.ProjectService)({})),
    Layer.provide(Layer.mock(SecretRequests.SecretRequests)({})),
    Layer.provide(Layer.mock(ThreadLaunch.ThreadLaunchService)({})),
    Layer.provide(Layer.mock(GitVcsDriver.GitVcsDriver)({})),
    Layer.provide(
      ServerConfig.layerTest(process.cwd(), { prefix: "t3-mcp-server-request-" }).pipe(
        Layer.provide(NodeServices.layer),
      ),
    ),
    Layer.provide(NodeServices.layer),
    Layer.fresh,
  );
  const here = yield* Layer.build(layerHere);
  const server = Context.get(here, McpServer.McpServer);
  return {
    orchestrator: Context.get(here, Orchestrator.OrchestratorV2),
    sink: Context.get(here, EventSink.EventSinkV2),
    call: (args: Record<string, unknown>) =>
      server
        .callTool({ name: "t3_mcp_server_request", arguments: args })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, scope),
          Effect.provideService(McpSchema.McpServerClient, mcpClient),
        ),
  };
});
type Here = Effect.Success<typeof makeHere>;

/** The thread, mid-turn, on a provider thread with one server off and one always on. */
const seedThread = (a: Here) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const providerThreadId = ProviderThreadId.make("provider-thread:mcp");
    yield* a.orchestrator.dispatch({
      type: "thread.create",
      createdBy: "user",
      creationSource: "web",
      commandId: CommandId.make("command:create:mcp"),
      threadId,
      projectId: ProjectId.make("project:mcp"),
      title: "MCP",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
    });
    yield* a.sink.write({
      commandId: CommandId.make("command:seed:mcp"),
      events: [
        {
          id: EventId.make("event:seed-provider-thread"),
          type: "provider-thread.updated",
          threadId,
          driver,
          providerInstanceId: instanceId,
          occurredAt: now,
          payload: {
            id: providerThreadId,
            driver,
            providerInstanceId: instanceId,
            providerSessionId: null,
            appThreadId: threadId,
            ownerNodeId: rootNode,
            nativeThreadRef: { driver, nativeId: "native:mcp", strength: "strong" },
            nativeConversationHeadRef: null,
            status: "active",
            firstRunOrdinal: 1,
            lastRunOrdinal: 1,
            handoffIds: [],
            forkedFrom: null,
            mcpServers: [
              { name: spotify, status: "disabled", alwaysOn: false },
              { name: "memsearch", status: "connected", alwaysOn: true },
            ],
            createdAt: now,
            updatedAt: now,
          },
        },
        {
          id: EventId.make("event:seed-node"),
          type: "node.updated",
          threadId,
          runId,
          nodeId: rootNode,
          driver,
          providerInstanceId: instanceId,
          occurredAt: now,
          payload: {
            id: rootNode,
            threadId,
            runId,
            parentNodeId: null,
            rootNodeId: rootNode,
            kind: "root_turn",
            status: "running",
            countsForRun: true,
            providerThreadId,
            providerTurnId: null,
            nativeItemRef: null,
            runtimeRequestId: null,
            checkpointScopeId: null,
            startedAt: now,
            completedAt: null,
          },
        },
        {
          id: EventId.make("event:seed-run"),
          type: "run.updated",
          threadId,
          runId,
          nodeId: rootNode,
          providerInstanceId: instanceId,
          occurredAt: now,
          payload: {
            id: runId,
            threadId,
            ordinal: 1,
            providerInstanceId: instanceId,
            modelSelection,
            providerThreadId,
            userMessageId: MessageId.make("message:seed-user"),
            rootNodeId: rootNode,
            activeAttemptId: null,
            status: "running",
            requestedAt: now,
            startedAt: now,
            completedAt: null,
            checkpointId: null,
            contextHandoffId: null,
          },
        },
      ],
    });
  });

const cardsOf = (a: Here) =>
  a.orchestrator
    .getThreadProjection(threadId)
    .pipe(
      Effect.map((projection) =>
        projection.turnItems.filter((item) => item.type === "mcp_server_request"),
      ),
    );

/** The agent asks for Spotify; the one open card it left. */
const askForSpotify = (a: Here) =>
  Effect.gen(function* () {
    const asked = yield* a.call({ server: spotify, reason: "Play the focus playlist." });
    const cards = yield* cardsOf(a);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      status: "waiting",
      mcpServerStatus: "pending",
      server: spotify,
      reason: "Play the focus playlist.",
    });
    expect(asked.structuredContent).toEqual({ status: "pending", turnItemId: cards[0]!.id });
    return cards[0]!;
  });

const answer = (a: Here, turnItemId: TurnItemId, enable: boolean, key = "answer") =>
  a.orchestrator.dispatch({
    type: "thread.mcp-server-request.answer",
    commandId: CommandId.make(`command:${key}:mcp`),
    threadId,
    turnItemId,
    enable,
  });

const notifications = (a: Here) =>
  a.orchestrator
    .getThreadProjection(threadId)
    .pipe(
      Effect.map((projection) =>
        projection.messages.filter((message) => message.notification !== undefined),
      ),
    );

const errorOf = (result: McpSchema.CallToolResult) => {
  const text = result.content[0];
  return result.isError === true && text?.type === "text" ? JSON.parse(text.text) : undefined;
};

const withHere = <A, E, R>(body: (a: Here) => Effect.Effect<A, E, R>) =>
  Effect.scoped(Effect.flatMap(makeHere, (a) => Effect.andThen(seedThread(a), body(a))));

it.effect("lists only the servers that are off, and shows no card for one already on", () =>
  withHere((a) =>
    Effect.gen(function* () {
      expect((yield* a.call({})).structuredContent).toEqual({
        status: "available",
        servers: [spotify],
      });
      expect(errorOf(yield* a.call({ server: "github" }))).toMatchObject({
        code: "invalid_request",
      });
      expect((yield* a.call({ server: "memsearch" })).structuredContent).toEqual({
        status: "enabled",
      });
      expect(yield* cardsOf(a)).toEqual([]);
    }),
  ),
);

it.effect("switching the server on enables it for the thread and tells the agent once", () =>
  withHere((a) =>
    Effect.gen(function* () {
      const card = yield* askForSpotify(a);
      // Asking again while the card is open adds no second card.
      expect((yield* a.call({ server: spotify })).structuredContent).toEqual({
        status: "pending",
        turnItemId: card.id,
      });
      expect(yield* cardsOf(a)).toHaveLength(1);
      yield* answer(a, card.id, true);
      expect(yield* cardsOf(a)).toMatchObject([
        { status: "completed", mcpServerStatus: "enabled" },
      ]);
      const projection = yield* a.orchestrator.getThreadProjection(threadId);
      expect(projection.thread.enabledMcpServers).toContain(spotify);
      const messages = yield* notifications(a);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ notification: { outcome: "completed" } });
      expect(messages[0]!.text).toContain(spotify);
      // Now on, it is no longer offered or asked for.
      expect((yield* a.call({})).structuredContent).toEqual({ status: "available", servers: [] });
      expect((yield* a.call({ server: spotify })).structuredContent).toEqual({
        status: "enabled",
      });

      // A card is answered once.
      yield* answer(a, card.id, false, "again").pipe(Effect.flip);
      expect(yield* notifications(a)).toHaveLength(1);
    }),
  ),
);

it.effect("declining keeps the server off and tells the agent", () =>
  withHere((a) =>
    Effect.gen(function* () {
      const card = yield* askForSpotify(a);
      yield* answer(a, card.id, false);
      expect(yield* cardsOf(a)).toMatchObject([
        { status: "cancelled", mcpServerStatus: "declined" },
      ]);
      const projection = yield* a.orchestrator.getThreadProjection(threadId);
      expect(projection.thread.enabledMcpServers ?? []).not.toContain(spotify);
      const messages = yield* notifications(a);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ notification: { outcome: "cancelled" } });
      expect(messages[0]!.text).toContain(spotify);
    }),
  ),
);

it.effect("stopping the thread closes its open card, which then takes no answer", () =>
  withHere((a) =>
    Effect.gen(function* () {
      const card = yield* askForSpotify(a);
      yield* a.orchestrator.dispatch({
        type: "thread.stop",
        commandId: CommandId.make("command:stop:mcp"),
        threadId,
      });
      expect(yield* cardsOf(a)).toMatchObject([
        { status: "cancelled", mcpServerStatus: "cancelled" },
      ]);
      yield* answer(a, card.id, true).pipe(Effect.flip);
      expect(yield* notifications(a)).toHaveLength(0);
    }),
  ),
);

it.effect("a delegated task starts with the servers its parent switched on", () =>
  withHere((a) =>
    Effect.gen(function* () {
      const card = yield* askForSpotify(a);
      yield* answer(a, card.id, true);
      yield* a.orchestrator.dispatch({
        type: "delegated_task.request",
        createdBy: "agent",
        creationSource: "server",
        commandId: CommandId.make("command:delegate:mcp"),
        parentThreadId: threadId,
        parentRunId: runId,
        parentNodeId: rootNode,
        task: "Queue the focus playlist.",
        modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
      });
      const parent = yield* a.orchestrator.getThreadProjection(threadId);
      const childThreadId = parent.subagents[0]?.childThreadId;
      expect(childThreadId).toBeDefined();
      const child = yield* a.orchestrator.getThreadProjection(childThreadId!);
      expect(child.thread.enabledMcpServers).toEqual([spotify]);
    }),
  ),
);
