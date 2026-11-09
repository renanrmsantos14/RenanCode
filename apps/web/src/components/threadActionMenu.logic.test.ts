import { describe, expect, it } from "vite-plus/test";

import { buildThreadActionMenuItems, type ThreadActionMenuState } from "./threadActionMenu.logic";

const baseState: ThreadActionMenuState = {
  canOperate: true,
  branch: null,
  projectFilter: null,
  isPinned: false,
  isSettled: false,
  autoSettleEnabled: true,
  isSnoozed: false,
  canSnoozeNow: true,
  isRegeneratingTitle: false,
  isRunning: false,
  supports: {
    settlement: true,
    autoSettleOptOut: true,
    snooze: true,
    pinning: true,
    titleRegeneration: true,
  },
  snoozePresets: [
    { id: "hour", label: "In 1 hour", whenLabel: "3:00 PM", snoozedUntil: "2026-08-07T15:00:00Z" },
  ],
};

describe("buildThreadActionMenuItems", () => {
  it.each([false, true])(
    "disables both lifecycle directions without permission (reversed: %s)",
    (reversed) => {
      const items = buildThreadActionMenuItems({
        ...baseState,
        canOperate: false,
        isPinned: reversed,
        isSettled: reversed,
        isSnoozed: reversed,
        isTesting: reversed,
      });
      const expected = reversed
        ? [
            "unpin",
            "unsettle",
            "untesting",
            "unsnooze",
            "rename",
            "regenerate-title",
            "components",
            "auto-settle",
            "archive",
            "delete",
          ]
        : [
            "pin",
            "settle",
            "testing",
            "snooze",
            "rename",
            "regenerate-title",
            "components",
            "auto-settle",
            "archive",
            "delete",
          ];
      expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual(expected);
      expect(
        items.find((item) => item.id === "snooze")?.children?.every((child) => child.disabled) ??
          true,
      ).toBe(true);
    },
  );

  it("offers continuing elsewhere only when the machine is offline, even for read-only clients", () => {
    const ids = (state: ThreadActionMenuState) =>
      buildThreadActionMenuItems(state).filter((item) => item.id === "continue-elsewhere");
    expect(ids(baseState)).toEqual([]);
    const [item] = ids({ ...baseState, canOperate: false, canContinueElsewhere: true });
    expect(item?.disabled).toBeUndefined();
    expect(item?.label).toBe("Continue on another machine");
    expect(ids({ ...baseState, canContinueElsewhere: true, hasContinuation: true })[0]?.label).toBe(
      "Open continued thread",
    );
  });

  it("disables archive and turning into a project while the thread is running", () => {
    const items = buildThreadActionMenuItems({
      ...baseState,
      isRunning: true,
      canTurnIntoProject: true,
    });
    expect(items.find((item) => item.id === "archive")?.disabled).toBe(true);
    expect(items.find((item) => item.id === "turn-into-project")?.disabled).toBe(true);
  });
});
