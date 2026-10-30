import { describe, expect, it } from "vite-plus/test";

import { sanitizeCommitSubject, sanitizeNextAction } from "./textGenerationUtils.ts";

describe("sanitizeCommitSubject", () => {
  // regression: #19181 truncation split grapheme clusters at the subject limit
  it.each([
    { name: "an emoji", prefixLength: 71, character: "🚀" },
    { name: "an accented character", prefixLength: 71, character: "e\u0301" },
    { name: "a joined emoji", prefixLength: 65, character: "👨‍👩‍👧‍👦" },
  ])("keeps $name intact at the subject limit", ({ prefixLength, character }) => {
    const prefix = "a".repeat(prefixLength);

    expect(sanitizeCommitSubject(`${prefix}${character} more`)).toBe(prefix);
  });
});

describe("sanitizeNextAction", () => {
  it.each([
    { raw: '  "Run the tests"  ', expected: "Run the tests" },
    { raw: "Apply the fix\nthen push", expected: "Apply the fix" },
    { raw: "Rode   os\ttestes", expected: "Rode os testes" },
    { raw: "   ", expected: "" },
    { raw: "x".repeat(250), expected: "x".repeat(200) },
  ])("normalizes $raw", ({ raw, expected }) => {
    expect(sanitizeNextAction(raw)).toBe(expected);
  });
});
