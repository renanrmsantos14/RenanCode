import { describe, expect, it } from "vite-plus/test";

import {
  deriveReviewGallery,
  findReviewIndex,
  reviewItemsFromPreview,
  type ReviewGalleryEntry,
} from "./reviewGallery";

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

  it("lists the chat's videos among its images, in the order the chat shows them", () => {
    const gallery = deriveReviewGallery(
      [
        assistant("a1", "![clip](https://x.test/clip.mp4) ![tune](https://x.test/tune.mp3)"),
        assistant("a2", "![demo](/work/demo.webm) ![shot](/work/shot.png)"),
        {
          id: "u1",
          kind: "message",
          message: {
            role: "user",
            text: "",
            attachments: [
              {
                type: "file",
                id: "vid-1",
                name: "screen.mp4",
                mimeType: "video/mp4",
                sizeBytes: 1,
              },
              {
                type: "image",
                id: "img-1",
                name: "shot.png",
                mimeType: "image/png",
                sizeBytes: 1,
                previewUrl: "blob:shot",
              },
              {
                type: "file",
                id: "vid-2",
                name: "private.mp4",
                mimeType: "video/mp4",
                sizeBytes: 1,
                downloadable: false,
              },
            ],
          },
        },
      ],
      { cwd: "/work" },
    );
    expect(gallery.map((item) => [item.rowId, item.kind, item.name, item.ordinal])).toEqual([
      ["a1", "video", "clip.mp4", 0],
      ["a2", "video", "demo.webm", 0],
      ["a2", "image", "shot.png", 1],
      ["u1", "image", "shot.png", 0],
      ["u1", "video", "screen.mp4", 1],
    ]);

    const index = findReviewIndex(
      gallery,
      {
        images: [
          {
            src: null,
            name: "screen.mp4",
            type: "video",
            actionsSource: {
              kind: "video",
              name: "screen.mp4",
              src: null,
              asset: {
                environmentId: "env" as never,
                resource: {
                  _tag: "attachment",
                  attachmentId: "vid-1",
                  fileName: "screen.mp4",
                  mimeType: "video/mp4",
                },
              },
            },
          },
        ],
        index: 0,
      },
      { cwd: "/work", hostImageUrl: null },
    );
    expect(gallery[index]?.name).toBe("screen.mp4");
  });

  it("keeps what a click outside the gallery passed, video and screenshot details included", () => {
    const items = reviewItemsFromPreview({
      images: [
        { src: "blob:clip", name: "clip.mp4", type: "video", ownsSrc: true },
        { src: "blob:shot", name: "shot.png", mimeType: "image/png" },
      ],
      index: 1,
    });
    expect(items.map((item) => [item.kind, item.name, item.rowId, item.ownsSrc])).toEqual([
      ["video", "clip.mp4", null, true],
      ["image", "shot.png", null, undefined],
    ]);
  });
});
