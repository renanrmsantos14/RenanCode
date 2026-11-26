import { htmlVariantChoiceTag } from "@t3tools/shared/htmlRender";
import { msg } from "gt-react-native";

import { m, type MessageResolver } from "../i18n/messages";

/** The composer prefix for picking a variant, in the app language; history recognizes it by its tag. */
export function htmlVariantChoiceText(
  index: number,
  label: string,
  resolve: MessageResolver = m,
): string {
  const choice = htmlVariantChoiceTag(index, label).trimEnd();
  return `${resolve(msg("I chose {choice}", { choice }))} `;
}
