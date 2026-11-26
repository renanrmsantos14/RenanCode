import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { DesignSketchReference } from "@t3tools/shared/design";
import { htmlRenderFileName, htmlVariantLetter } from "@t3tools/shared/htmlRender";
import { T, useGT, useMessages, Var } from "gt-react-native";
import { Image } from "expo-image";
import { Pressable, View, type ColorValue } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { htmlVariantChoiceText } from "../../lib/htmlVariantChoice";
import { useAssetUrl } from "../../state/assets";

const THUMBNAIL_HEIGHT = 160;
const CARD_GAP = 8;

function DesignSketchCard(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly sketch: DesignSketchReference;
  readonly letter: string | undefined;
  readonly iconColor: ColorValue;
  readonly onFollow?: (() => void) | undefined;
}) {
  const gt = useGT();
  const navigation = useNavigation();
  const { sketch } = props;
  const fileName = htmlRenderFileName(sketch.title);
  const thumbnail = useAssetUrl(
    sketch.thumbnailAttachmentId === null ? null : props.environmentId,
    sketch.thumbnailAttachmentId === null
      ? null
      : {
          _tag: "attachment",
          attachmentId: sketch.thumbnailAttachmentId,
          fileName: "sketch.png",
          mimeType: "image/png",
          disposition: "inline",
        },
  );
  return (
    <View className="gap-1.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={gt("Open sketch {title}", { title: sketch.title })}
        className="overflow-hidden rounded-lg border border-border/60 bg-card"
        onPress={() =>
          navigation.navigate("ThreadAttachment", {
            environmentId: String(props.environmentId),
            threadId: String(props.threadId),
            attachmentId: sketch.attachmentId,
            name: fileName,
            mimeType: "text/html",
            sizeBytes: "0",
            htmlRender: "1",
          })
        }
      >
        <View
          style={{ height: THUMBNAIL_HEIGHT }}
          className="items-center justify-center bg-muted/40"
        >
          {thumbnail !== null ? (
            <Image
              source={{ uri: thumbnail }}
              contentFit="cover"
              contentPosition="top"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <SymbolView
              name="square.on.square"
              size={28}
              tintColor={props.iconColor}
              type="monochrome"
            />
          )}
        </View>
        <View className="flex-row items-center gap-2 px-3 py-2">
          {props.letter !== undefined ? (
            <Text className="rounded bg-muted px-1.5 text-xs font-medium text-foreground-muted">
              {props.letter}
            </Text>
          ) : null}
          <Text className="min-w-0 flex-1 text-sm font-medium text-foreground" numberOfLines={1}>
            {sketch.title}
          </Text>
        </View>
      </Pressable>
      {props.onFollow && props.letter !== undefined ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={4}
          className="self-start rounded-full bg-foreground px-3 py-1"
          onPress={props.onFollow}
        >
          <Text className="text-xs font-medium text-background">
            <T>
              Use <Var>{props.letter}</Var>
            </T>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The screens a `design_sketch` or `html_variants` call saved; a tap opens the page full screen. */
export function ThreadDesignSketches(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly sketches: ReadonlyArray<DesignSketchReference>;
  readonly iconColor: ColorValue;
  readonly onFollow?: ((text: string) => void) | undefined;
}) {
  const { onFollow } = props;
  const m = useMessages();
  const lettered = props.sketches.length > 1;
  return (
    <View className="mb-2 px-1" style={{ gap: CARD_GAP }}>
      {props.sketches.map((sketch, index) => (
        <DesignSketchCard
          key={sketch.sketchId}
          environmentId={props.environmentId}
          threadId={props.threadId}
          sketch={sketch}
          letter={lettered ? htmlVariantLetter(index) : undefined}
          iconColor={props.iconColor}
          onFollow={
            onFollow
              ? () => onFollow(htmlVariantChoiceText(index, sketch.label ?? sketch.title, m))
              : undefined
          }
        />
      ))}
    </View>
  );
}
