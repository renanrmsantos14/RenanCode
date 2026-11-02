import type { ChildThreadApproval } from "@t3tools/client-runtime/state/thread-requests";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({
  respond: vi.fn(),
  addToast: vi.fn(),
  approvalsAtom: null as unknown,
}));

vi.mock("../../state/session", () => ({ useEnvironmentScope: () => true }));
vi.mock("../ui/toast", () => ({ toastManager: { add: state.addToast } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.respond }));
vi.mock("../../state/threads", () => ({
  childThreadApprovalsAtom: () => state.approvalsAtom,
  threadEnvironment: { respondToApproval: {} },
  environmentThreadDetails: { pendingRequestsAtom: () => Atom.make(null) },
}));

import { ChildThreadApprovals } from "./ChildThreadApprovals";

function setup() {
  state.respond.mockReset();
  state.addToast.mockReset();
  state.respond
    .mockResolvedValueOnce(AsyncResult.failure(Cause.fail(new Error("Child environment offline"))))
    .mockResolvedValueOnce(AsyncResult.success(undefined));
  const thread = {
    environmentId: EnvironmentId.make("child-env"),
    threadId: ThreadId.make("child"),
  };
  state.approvalsAtom = Atom.make<ReadonlyArray<ChildThreadApproval>>([
    {
      thread,
      title: "Compile task",
      approval: {
        requestId: RuntimeRequestId.make("approval"),
        requestKind: "command",
        detail: "Run compiler",
        createdAt: "2026-11-01T00:00:00.000Z",
        responseCapability: "live",
      },
    },
  ]);
  return thread;
}

it("reports a failed decision as a toast and lets the user retry", async () => {
  const thread = setup();
  await using screen = await render(<ChildThreadApprovals threadRef={thread} />);
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  expect(state.addToast).toHaveBeenCalledWith(
    expect.objectContaining({ type: "error", description: "Child environment offline" }),
  );
  await screen.getByRole("button", { name: "Approve", exact: true }).click();
  expect(state.respond).toHaveBeenCalledTimes(2);
  expect(state.addToast).toHaveBeenCalledTimes(1);
});
