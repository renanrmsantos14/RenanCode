import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { WorkModulesToolkit } from "./tools.ts";

describe("t3_work_module_suggest parameters", () => {
  it("accepts create, link, confirm, note and status", () => {
    const decode = Schema.decodeUnknownExit(
      WorkModulesToolkit.tools.t3_work_module_suggest.parametersSchema,
    );
    expect(Exit.isSuccess(decode({ action: "note", moduleId: "m:1", text: "PR opened" }))).toBe(
      true,
    );
    expect(Exit.isSuccess(decode({ action: "confirm", threadId: "t:1" }))).toBe(true);
    expect(Exit.isSuccess(decode({ action: "status", moduleId: "m:1", status: "done" }))).toBe(
      true,
    );
    expect(Exit.isFailure(decode({ action: "status", moduleId: "m:1", status: "shipped" }))).toBe(
      true,
    );
    expect(Exit.isFailure(decode({ action: "set_status", moduleId: "m:1" }))).toBe(true);
    expect(Exit.isFailure(decode({ action: "create", projectId: "p", title: "   " }))).toBe(true);
  });
});
