import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import { groupSidebarSubagents } from "../Sidebar.logic";
import { SidebarSubagentList } from "./SidebarSubagentList";

const environmentId = EnvironmentId.make("subagent-list-environment");
const parentId = ThreadId.make("subagent-parent");
const child = (id: string, title: string) =>
  makeThreadFixture({
    id: ThreadId.make(id),
    environmentId,
    title,
    lineage: { rootThreadId: parentId, parentThreadId: parentId, relationshipToParent: "subagent" },
  });

it("lists subagent titles under the parent, collapsed by default once none is running", async () => {
  const onThreadActivate = vi.fn();
  const first = child("subagent-a", "Revisar o diff");
  const second = child("subagent-b", "Rodar os testes");
  await using screen = await render(
    <SidebarSubagentList
      parentKey={`${environmentId}:${parentId}`}
      subagentsByParent={groupSidebarSubagents([first, second], new Set())}
      activeThreadKey={null}
      onThreadActivate={onThreadActivate}
    />,
    // A bare list; nothing here links or navigates.
    { router: false },
  );
  const toggle = screen.getByRole("button", { name: "2 subagents" });
  await expect.element(screen.getByText("Revisar o diff")).not.toBeInTheDocument();
  await userEvent.click(toggle);
  await userEvent.click(screen.getByText("Rodar os testes"));
  expect(onThreadActivate).toHaveBeenCalledWith({ environmentId, threadId: second.id });
});
