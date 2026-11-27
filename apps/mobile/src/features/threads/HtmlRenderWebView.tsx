import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { useNavigation } from "@react-navigation/native";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  HTML_RENDER_NATIVE_OPEN_IMAGE_SCRIPT,
  htmlRenderFileName,
  htmlRenderFrameHeight,
  htmlRenderThemeFragment,
  htmlRenderThemeMessage,
  htmlVariantLetter,
  htmlVariantsFrameHeight,
  readHtmlRenderImageRequest,
  type HtmlRenderReference,
  type HtmlRenderTheme,
  type HtmlVariantReference,
} from "@t3tools/shared/htmlRender";
import { T, useGT, useMessages, Var } from "gt-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  type ColorValue,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { SymbolView } from "../../components/ui/AppSymbol";
import { FilePreviewModal, type FilePreviewSource } from "../../components/ui/FilePreviewModal";
import { AppText as Text } from "../../components/ui/AppText";
import { htmlVariantChoiceText } from "../../lib/htmlVariantChoice";
import { mobileHtmlRenderTheme } from "../../lib/htmlRenderTheme";
import { useOpenPullRequest } from "../../native/useOpenPullRequest";
import { useAssetUrlState, useRefreshAssetUrl } from "../../state/assets";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { webViewDecelerationRate } from "../../lib/webViewDecelerationRate";

const ROW_BOTTOM_MARGIN = 8;
const ACTION_ROW_HEIGHT = 32;
const FULL_SCREEN_GUTTER = 16;
const VARIANTS_HEADER_HEIGHT = 40;
const VARIANTS_COLLAPSED_HEIGHT = 56;

export function htmlRenderRowHeight(frameHeight: number) {
  return ACTION_ROW_HEIGHT + frameHeight + ROW_BOTTOM_MARGIN;
}

export function htmlVariantsRowHeight(frameHeight: number) {
  return htmlRenderRowHeight(frameHeight) + VARIANTS_HEADER_HEIGHT;
}

export function htmlVariantsCollapsedRowHeight() {
  return VARIANTS_COLLAPSED_HEIGHT + ROW_BOTTOM_MARGIN;
}

function useHtmlRenderTheme() {
  const { themeId, themeAppearance, themeVariables, systemColorsActive } =
    useAppearancePreferences();
  return mobileHtmlRenderTheme({
    themeId,
    appearance: themeAppearance,
    variables: themeVariables,
    systemColors: systemColorsActive,
    platform: Platform.OS,
  });
}

function postTheme(view: WebView<object> | null, theme: HtmlRenderTheme) {
  view?.injectJavaScript(
    `window.postMessage(${JSON.stringify(htmlRenderThemeMessage(theme))}, "*"); true;`,
  );
}

const OVERFLOW_MESSAGE_TYPE = "t3-html-render-overflow";

const OVERFLOW_SCRIPT = `(function(){var last;function report(){var d=document.documentElement,b=document.body;var x=Math.max(d.scrollWidth,b?b.scrollWidth:0)>window.innerWidth+1,y=Math.max(d.scrollHeight,b?b.scrollHeight:0)>window.innerHeight+1,o=x+","+y;if(o===last)return;last=o;window.ReactNativeWebView.postMessage(JSON.stringify({type:${JSON.stringify(OVERFLOW_MESSAGE_TYPE)},x:x,y:y}));}report();if(window.ResizeObserver){var r=new ResizeObserver(report);r.observe(document.documentElement);if(document.body)r.observe(document.body);}window.addEventListener("resize",report);})();true;`;

type Overflow = { readonly x: boolean; readonly y: boolean };

const NO_OVERFLOW: Overflow = { x: false, y: false };

function readOverflowMessage(message: unknown): Overflow | null {
  return typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === OVERFLOW_MESSAGE_TYPE &&
    "x" in message &&
    typeof message.x === "boolean" &&
    "y" in message &&
    typeof message.y === "boolean"
    ? { x: message.x, y: message.y }
    : null;
}

function parseMessage(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function imagePreviewSource(message: unknown): FilePreviewSource | null {
  const request = readHtmlRenderImageRequest(message);
  if (request === undefined) return null;
  const gallery = request.images.map((image) => ({
    kind: "image" as const,
    uri: image.src,
    name: image.name,
  }));
  const selected = gallery[request.index];
  return selected ? { ...selected, gallery } : null;
}

const withoutFragment = (url: string) => url.split("#", 1)[0];

export function HtmlRenderWebView(props: {
  readonly uri: string;
  readonly title: string;
  readonly nested: boolean;
  readonly onLoadError?: () => void;
}) {
  const theme = useHtmlRenderTheme();
  const openLink = useOpenPullRequest();
  const [initialTheme] = useState(theme);
  const [generation, setGeneration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [overflow, setOverflow] = useState(NO_OVERFLOW);
  const [preview, setPreview] = useState<FilePreviewSource | null>(null);
  const webView = useRef<WebView<object>>(null);
  const crashes = useRef(0);
  const shownTheme = useRef<HtmlRenderTheme | null>(null);
  const source = { uri: props.uri + htmlRenderThemeFragment(initialTheme) };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- posts theme changes into the already loaded WebView
  useEffect(() => {
    if (shownTheme.current === null || shownTheme.current === theme) return;
    shownTheme.current = theme;
    postTheme(webView.current, theme);
  }, [theme]);
  const restart = () => {
    crashes.current += 1;
    if (crashes.current > 1) {
      props.onLoadError?.();
      return;
    }
    shownTheme.current = null;
    setLoaded(false);
    setOverflow(NO_OVERFLOW);
    setGeneration((value) => value + 1);
  };
  const scrollable = !props.nested || overflow.x || overflow.y;
  return (
    <View
      style={
        props.nested
          ? { flex: 1 }
          : {
              flex: 1,
              paddingHorizontal: FULL_SCREEN_GUTTER,
              backgroundColor: theme.variables["--background"],
            }
      }
    >
      <WebView<object>
        key={generation}
        ref={webView}
        source={source}
        accessibilityLabel={props.title}
        style={{ flex: 1, backgroundColor: "transparent" }}
        allowsInlineMediaPlayback
        contentInsetAdjustmentBehavior={props.nested ? "never" : "automatic"}
        bounces={!props.nested}
        showsVerticalScrollIndicator={!props.nested}
        showsHorizontalScrollIndicator={!props.nested}
        scrollEnabled={scrollable}
        decelerationRate={webViewDecelerationRate}
        // Android's patched WebView always keeps horizontal drags. Only pages
        // with vertical overflow hold vertical drags until they reach an edge.
        nestedScrollEnabled={props.nested && overflow.y}
        overScrollMode={props.nested ? "never" : "always"}
        onShouldStartLoadWithRequest={(request) =>
          request.isTopFrame === false ||
          withoutFragment(request.url) === withoutFragment(props.uri)
        }
        onOpenWindow={(event) => {
          const url = event.nativeEvent.targetUrl;
          if (/^https?:/i.test(url)) void openLink(url);
        }}
        onLoadEnd={() => {
          setLoaded(true);
          shownTheme.current = theme;
          if (theme !== initialTheme) postTheme(webView.current, theme);
        }}
        onError={props.onLoadError}
        onHttpError={props.onLoadError}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        injectedJavaScript={
          props.nested
            ? OVERFLOW_SCRIPT + HTML_RENDER_NATIVE_OPEN_IMAGE_SCRIPT
            : HTML_RENDER_NATIVE_OPEN_IMAGE_SCRIPT
        }
        onMessage={(event: WebViewMessageEvent) => {
          const message = parseMessage(event.nativeEvent.data);
          const image = imagePreviewSource(message);
          if (image !== null) {
            setPreview(image);
            return;
          }
          const next = props.nested ? readOverflowMessage(message) : null;
          if (next !== null) setOverflow(next);
        }}
      />
      <FilePreviewModal source={preview} onRequestClose={() => setPreview(null)} />
      {loaded ? null : (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
          <AppActivityIndicator />
        </View>
      )}
    </View>
  );
}

export function ThreadHtmlRender(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly render: HtmlRenderReference;
  readonly frameWidth: number;
  readonly height?: number;
  readonly iconColor: ColorValue;
}) {
  const gt = useGT();
  const navigation = useNavigation();
  const { attachmentId, title } = props.render;
  const height = props.height ?? htmlRenderFrameHeight(props.render, props.frameWidth);
  const fileName = htmlRenderFileName(title);
  const resource = {
    _tag: "attachment" as const,
    attachmentId,
    fileName,
    mimeType: "text/html",
    disposition: "inline" as const,
  };
  const asset = useAssetUrlState(props.environmentId, resource);
  const refresh = useRefreshAssetUrl(props.environmentId, resource);
  // Signed URLs are re-minted periodically; following them would reload the page.
  const [uri, setUri] = useState<string | null>(null);
  if (uri === null && asset._tag === "Success") setUri(asset.url);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retried = useRef(false);
  const handleLoadError = () => {
    if (retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    void refresh().then((next) => {
      if (next === null) setFailed(true);
      else if (next !== uri) setUri(next);
      else setAttempt((value) => value + 1);
    });
  };

  return (
    <View style={{ marginBottom: ROW_BOTTOM_MARGIN }}>
      <View style={{ height: ACTION_ROW_HEIGHT }} className="flex-row items-start justify-end">
        {uri !== null && !failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gt("Open {title}", { title })}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-card/80"
            onPress={() =>
              navigation.navigate("ThreadAttachment", {
                environmentId: String(props.environmentId),
                threadId: String(props.threadId),
                attachmentId,
                name: fileName,
                mimeType: "text/html",
                sizeBytes: "0",
                htmlRender: "1",
              })
            }
          >
            <SymbolView
              name="arrow.up.left.and.arrow.down.right"
              size={12}
              tintColor={props.iconColor}
              type="monochrome"
            />
          </Pressable>
        ) : null}
      </View>
      <View style={{ height }}>
        {uri !== null && !failed ? (
          <HtmlRenderWebView
            key={`${uri}:${attempt}`}
            uri={uri}
            title={title}
            nested
            onLoadError={handleLoadError}
          />
        ) : failed || asset._tag === "Failure" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={gt("Reload {title}", { title })}
            className="flex-1 items-center justify-center"
            onPress={() => {
              retried.current = false;
              setFailed(false);
              if (uri === null) void refresh().then((next) => next !== null && setUri(next));
            }}
          >
            <Text className="text-sm text-foreground-muted">
              <T>Page unavailable</T>
            </Text>
          </Pressable>
        ) : (
          <View className="flex-1 items-center justify-center">
            <AppActivityIndicator />
          </View>
        )}
      </View>
    </View>
  );
}

export function ThreadHtmlVariants(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly variants: ReadonlyArray<HtmlVariantReference>;
  readonly frameWidth: number;
  readonly iconColor: ColorValue;
  readonly choice: { readonly index: number; readonly note: string } | null;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onFollow?: (text: string) => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const scroll = useRef<ScrollViewInstance>(null);
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const height = htmlVariantsFrameHeight(props.variants, props.frameWidth);
  const chosenVariant = chosen === null ? undefined : props.variants[chosen];
  const summarized = props.choice === null ? undefined : props.variants[props.choice.index];
  const select = (index: number) => {
    setActive(index);
    setChosen(index);
    scroll.current?.scrollTo({ x: index * props.frameWidth, animated: true });
  };
  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setActive(Math.round(event.nativeEvent.contentOffset.x / props.frameWidth));
  };

  if (props.choice !== null && summarized !== undefined && !props.expanded) {
    return (
      <View
        className="flex-row items-center gap-3 rounded-lg border border-border/60 bg-card px-3"
        style={{
          height: VARIANTS_COLLAPSED_HEIGHT,
          marginBottom: ROW_BOTTOM_MARGIN,
          width: props.frameWidth,
        }}
      >
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-sm font-medium text-foreground">
            <T>
              You chose <Var>{htmlVariantLetter(props.choice.index)}</Var> ·{" "}
              <Var>{summarized.label}</Var>
            </T>
          </Text>
          {props.choice.note === "" ? null : (
            <Text numberOfLines={1} className="text-xs text-foreground-muted">
              {props.choice.note}
            </Text>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          className="rounded-full border border-border/60 px-3 py-1"
          onPress={props.onToggleExpanded}
        >
          <Text className="text-xs font-medium text-foreground">
            <T>Show all</T>
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View
        className="flex-row items-center gap-2"
        style={{ height: VARIANTS_HEADER_HEIGHT, width: props.frameWidth }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="min-w-0 flex-1"
          contentContainerClassName="gap-1.5"
        >
          {props.variants.map((variant, index) => (
            <Pressable
              key={variant.attachmentId}
              accessibilityRole={props.onFollow ? "radio" : "button"}
              accessibilityState={{ selected: index === active, checked: index === chosen }}
              accessibilityLabel={gt("Show variant {letter}", { letter: htmlVariantLetter(index) })}
              hitSlop={4}
              className={`shrink-0 flex-row items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                index === active ? "border-foreground/40 bg-card" : "border-border/60"
              }`}
              onPress={() => select(index)}
            >
              {props.onFollow ? (
                <View className="h-3 w-3 items-center justify-center rounded-full border border-foreground/50">
                  {index === chosen ? (
                    <View className="h-1.5 w-1.5 rounded-full bg-foreground" />
                  ) : null}
                </View>
              ) : null}
              <Text
                numberOfLines={1}
                className={`shrink text-xs ${index === active ? "text-foreground" : "text-foreground-muted"}`}
              >
                {`${htmlVariantLetter(index)} · ${variant.label}`}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {props.onFollow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: chosenVariant === undefined }}
            disabled={chosenVariant === undefined}
            hitSlop={4}
            className={`rounded-full bg-foreground px-3 py-1 ${chosenVariant === undefined ? "opacity-40" : ""}`}
            onPress={() => {
              if (chosen === null || chosenVariant === undefined) return;
              props.onFollow?.(htmlVariantChoiceText(chosen, chosenVariant.label, m));
            }}
          >
            <Text className="text-xs font-medium text-background">
              {chosen === null
                ? gt("Choose", { $context: "button, picks the selected variant" })
                : gt("Choose {letter}", { letter: htmlVariantLetter(chosen) })}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        ref={scroll}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        style={{ width: props.frameWidth }}
      >
        {props.variants.map((variant) => (
          <View key={variant.attachmentId} style={{ width: props.frameWidth }}>
            <ThreadHtmlRender
              environmentId={props.environmentId}
              threadId={props.threadId}
              render={variant}
              frameWidth={props.frameWidth}
              height={height}
              iconColor={props.iconColor}
            />
          </View>
        ))}
      </ScrollView>
      {props.choice === null ? null : (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          className="mb-2 self-end rounded-full border border-border/60 px-3 py-1"
          onPress={props.onToggleExpanded}
        >
          <Text className="text-xs font-medium text-foreground">
            <T>Collapse</T>
          </Text>
        </Pressable>
      )}
    </View>
  );
}
