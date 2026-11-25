import { describe, expect, it } from "vite-plus/test";

import { buildFrameUrl } from "./frameUrl";

describe("buildFrameUrl", () => {
  it("turns a bare port into a localhost page", () => {
    expect(buildFrameUrl("5173", "")).toBe("http://localhost:5173/");
  });

  it("keeps the origin of a full URL and applies the route", () => {
    expect(buildFrameUrl("http://127.0.0.1:3000/ignored", "settings")).toBe(
      "http://127.0.0.1:3000/settings",
    );
    expect(buildFrameUrl("https://example.com", "/a?b=1#c")).toBe("https://example.com/a?b=1#c");
  });

  it("accepts host:port and rejects empty or non-web addresses", () => {
    expect(buildFrameUrl("localhost:8080", "/")).toBe("http://localhost:8080/");
    expect(buildFrameUrl("  ", "/")).toBeNull();
    expect(buildFrameUrl("ftp://host", "/")).toBeNull();
  });
});
