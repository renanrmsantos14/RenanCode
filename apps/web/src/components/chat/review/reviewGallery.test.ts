import { describe, expect, it } from "vite-plus/test";

import { deriveReviewGallery, type ReviewGalleryEntry } from "./reviewGallery";

const assistant = (id: string, text: string): ReviewGalleryEntry => ({
  id,
  kind: "message",
  message: { role: "assistant", text },
});

describe("deriveReviewGallery", () => {
  it("lists every thread image in timeline order, across assistant, send_to_user and user rows", () => {
    const gallery = deriveReviewGallery([
      assistant("a1", "![one](https://x.test/one.png) and ![two](https://x.test/two.png)"),
      { id: "s1", kind: "sent-message", text: "![sent](https://x.test/sent.png)" },
      {
        id: "u1",
        kind: "message",
        message: {
          role: "user",
          text: "",
          attachments: [
            {
              type: "image",
              id: "att-1",
              name: "shot.png",
              mimeType: "image/png",
              sizeBytes: 1,
              previewUrl: "blob:shot",
            },
          ],
        },
      },
      assistant("a2", "no images here"),
    ]);
    expect(gallery.map((image) => [image.rowId, image.name])).toEqual([
      ["a1", "one.png"],
      ["a1", "two.png"],
      ["s1", "sent.png"],
      ["u1", "shot.png"],
    ]);
    expect(new Set(gallery.map((image) => image.key)).size).toBe(4);
  });

  it("leaves out a send_to_user that failed, which the timeline keeps as a work row", () => {
    const gallery = deriveReviewGallery([
      { id: "w1", kind: "work", text: "![failed](https://x.test/failed.png)" },
      assistant("a1", "![ok](https://x.test/ok.png)"),
    ]);
    expect(gallery.map((image) => image.name)).toEqual(["ok.png"]);
  });

  it("lists only what the chat shows as an image: one theme variant, no file chips", () => {
    const gallery = deriveReviewGallery(
      [
        assistant(
          "a1",
          [
            "<picture>",
            '  <source media="(prefers-color-scheme: dark)" srcset="https://x.test/logo-dark.png">',
            '  <img src="https://x.test/logo-light.png" alt="logo">',
            "</picture>",
            "",
            "![notes](/work/notes.txt) ![shot](/work/shot.png)",
          ].join("\n"),
        ),
      ],
      { cwd: "/work", theme: "dark" },
    );
    expect(gallery.map((image) => image.name)).toEqual(["logo-dark.png", "shot.png"]);
  });
});
