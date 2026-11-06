import { expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({}));

import {
  FILE_DRAG_MAX_BYTES,
  FILE_DRAG_TTL_MS,
  isDragSizeAllowed,
  sanitizeDragFileName,
  selectExpiredTokens,
} from "./fileDrag.ts";

it.each([
  ["../../etc/passwd", "passwd"],
  ["C:\\Users\\x\\report.pdf", "report.pdf"],
  ["a<b>.json", "a_b_.json"],
  ['q"u:e|s?*.txt', "q_u_e_s__.txt"],
  ["name.txt. . ", "name.txt"],
  ["tab\tname.txt", "tab_name.txt"],
  ["", "file"],
  ["..", "file"],
  ["dir/", "file"],
])("sanitizes %j to %j", (input, expected) => {
  expect(sanitizeDragFileName(input)).toBe(expected);
});

it("rejects oversize payloads", () => {
  expect(isDragSizeAllowed(FILE_DRAG_MAX_BYTES)).toBe(true);
  expect(isDragSizeAllowed(FILE_DRAG_MAX_BYTES + 1)).toBe(false);
});

it("selects only entries older than the ttl", () => {
  const entries = new Map([
    ["old", { path: "/a", createdAt: 0 }],
    ["fresh", { path: "/b", createdAt: FILE_DRAG_TTL_MS }],
  ]);
  expect(selectExpiredTokens(entries, FILE_DRAG_TTL_MS + 1)).toEqual(["old"]);
  expect(selectExpiredTokens(entries, 0)).toEqual([]);
});
