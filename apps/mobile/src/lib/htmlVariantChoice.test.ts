import { findHtmlVariantChoice } from "@t3tools/shared/htmlRender";
import { decodeOptions } from "gt-react-native";
import { expect, it } from "vite-plus/test";

import type { MessageResolver } from "../i18n/messages";
import { htmlVariantChoiceText } from "./htmlVariantChoice";

it("builds the English choice text without a catalog", () => {
  expect(htmlVariantChoiceText(1, "Airy (soft)")).toBe("I chose B (Airy (soft)): ");
});

it("builds the choice in the app language and history still recognizes it", () => {
  const text = htmlVariantChoiceText(1, "Airy", ((message: string) => {
    const options = decodeOptions(String(message));
    return `Escolhi ${options?.choice}`;
  }) as MessageResolver);
  expect(text).toBe("Escolhi B (Airy): ");
  expect(findHtmlVariantChoice([{ label: "Dense" }, { label: "Airy" }], [text])).toEqual({
    index: 1,
    note: "",
  });
});

it("names the last of 26 options and history recognizes it", () => {
  const labels = Array.from({ length: 26 }, (_, index) => ({ label: `Option ${index}` }));
  const text = htmlVariantChoiceText(25, "Option 25");
  expect(text).toBe("I chose Z (Option 25): ");
  expect(findHtmlVariantChoice(labels, [text])).toEqual({ index: 25, note: "" });
});
