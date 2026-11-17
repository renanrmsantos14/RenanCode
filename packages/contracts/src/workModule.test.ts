import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { WorkModuleDueDate, WorkModuleUpsertInput } from "./workModule.ts";

describe("work module schemas", () => {
  it("accepts only calendar dates as due dates", () => {
    const decode = Schema.decodeUnknownExit(WorkModuleDueDate);
    expect(Exit.isSuccess(decode("2026-11-20"))).toBe(true);
    expect(Exit.isFailure(decode("2026-11-20T10:00:00Z"))).toBe(true);
    expect(Exit.isFailure(decode("20/11/2026"))).toBe(true);
  });

  it("rejects an unknown status and a blank title", () => {
    const decode = Schema.decodeUnknownExit(WorkModuleUpsertInput);
    expect(Exit.isFailure(decode({ projectId: "p", title: "x", status: "paused" }))).toBe(true);
    expect(Exit.isFailure(decode({ projectId: "p", title: "   " }))).toBe(true);
    expect(Exit.isSuccess(decode({ projectId: "p", title: "Checkout" }))).toBe(true);
  });
});
