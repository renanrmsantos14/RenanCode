import { Button } from "../../components/ui/Button";
import { QuestionAttachments } from "./QuestionAttachments";
import type { EnvironmentId, RuntimeRequestId } from "@t3tools/contracts";
import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";
import {
  markdownProseDirection,
  textDirection,
  type TextDirection,
} from "@t3tools/shared/textDirection";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from "react-native-reanimated";

import { SymbolView } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { ControlPill } from "../../components/ui/ControlPill";
import { cn } from "../../lib/cn";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { useOpenPullRequest } from "../../native/useOpenPullRequest";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";
import { useLiveThreadLinkLabels } from "../../state/entities";
import {
  derivePendingUserInputProgress,
  isPendingUserInputOptionSelected,
  resolvePendingUserInputAnswer,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import type { PendingUserInput } from "../../lib/threadActivity";

export interface PendingUserInputCardProps {
  readonly environmentId: EnvironmentId;
  readonly canOperateThread: boolean;
  readonly pendingUserInput: PendingUserInput;
  readonly maxHeight: DerivedValue<number>;
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly onStopThread?: () => void;
  readonly cardProgress: SharedValue<number>;
  readonly cardCoverage: SharedValue<number>;
  readonly onInputFocusChange?: (focused: boolean) => void;
  readonly drafts: Record<string, PendingUserInputDraftAnswer>;
  readonly answers: Record<string, string | ReadonlyArray<string>> | null;
  readonly respondingUserInputId: RuntimeRequestId | null;
  readonly onSelectOption: (
    requestId: RuntimeRequestId,
    question: ThreadUserInputQuestion,
    value: string,
  ) => void;
  readonly onChangeCustomAnswer: (
    requestId: RuntimeRequestId,
    questionId: string,
    customAnswer: string,
  ) => void;
  readonly onSubmit: () => Promise<unknown>;
  readonly onDismiss: () => Promise<unknown>;
}

const AUTO_ADVANCE_DELAY_MS = 180;
const QUESTION_SWITCH_DURATION_MS = 160;

function proseDirectionStyle(text: string, setDirection: TextDirection | undefined) {
  const direction = textDirection(text);
  return {
    ...(direction ? { direction, writingDirection: direction } : null),
    textAlign: (direction === "rtl") === (setDirection === "rtl") ? "left" : "right",
  } as const;
}

function QuestionText(props: {
  readonly markdown: string;
  readonly environmentId: EnvironmentId;
  readonly setDirection: TextDirection | undefined;
}) {
  const styles = useMarkdownPreviewStyles();
  const markdown = useLiveThreadLinkLabels(props.markdown, props.environmentId);
  const openLink = useOpenPullRequest();
  return (
    <SelectableMarkdownText
      markdown={markdown}
      textStyle={styles.nativeTextStyle}
      writingDirection={markdownProseDirection(markdown)}
      // Android's renderer aligns relative to each paragraph's direction.
      textAlign={
        Platform.OS === "android" ? undefined : props.setDirection === "rtl" ? "right" : "left"
      }
      onLinkPress={(href) => void openLink(href)}
    />
  );
}

export function PendingUserInputCard(props: PendingUserInputCardProps) {
  const questions = props.pendingUserInput.questions;
  const questionCount = questions.length;
  const [requestedIndex, setRequestedIndex] = useState(0);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearAutoAdvance = () => {
    if (autoAdvanceTimer.current !== null) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  };
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- cancels the pending auto-advance timer on unmount
  useEffect(
    () => () => {
      if (autoAdvanceTimer.current !== null) clearTimeout(autoAdvanceTimer.current);
    },
    [],
  );
  const progress = derivePendingUserInputProgress(questions, props.drafts, requestedIndex);
  const activeQuestion = questions[progress.questionIndex];
  const questionIndex = progress.questionIndex;
  const goToQuestion = (index: number) => {
    clearAutoAdvance();
    setRequestedIndex(index);
  };
  const counter = questionCount > 1 ? `${questionIndex + 1}/${questionCount}` : null;
  const firstUnansweredIndex = questions.findIndex(
    (question) => resolvePendingUserInputAnswer(question, props.drafts[question.id]) === null,
  );
  const canRespond = props.pendingUserInput.responseCapability !== "not_resumable";
  const isResponding = props.respondingUserInputId === props.pendingUserInput.requestId;
  const responseDisabled = !canRespond || isResponding;
  const setDirection = markdownProseDirection(
    questions
      .flatMap((question) => [
        question.header,
        question.question,
        ...question.options.flatMap((option) => [option.label, option.description ?? ""]),
      ])
      .join(" "),
  );

  const { cardCoverage, cardProgress, maxHeight } = props;
  const barHeightRef = useRef(0);
  const cardHeightRef = useRef(0);
  const cardHeight = useSharedValue(0);
  const notifyCoverage = () => {
    // The card resizes with the keyboard every frame, so easing each sample would leave the
    // feed inset and floating controls trailing it.
    cardCoverage.set(Math.max(0, cardHeightRef.current - barHeightRef.current));
  };
  const handleBarLayout = (event: LayoutChangeEvent) => {
    barHeightRef.current = event.nativeEvent.layout.height;
    notifyCoverage();
  };
  const handleCardLayout = (event: LayoutChangeEvent) => {
    cardHeightRef.current = event.nativeEvent.layout.height;
    cardHeight.set(event.nativeEvent.layout.height);
    notifyCoverage();
  };
  const handleSelectOption = (question: ThreadUserInputQuestion, value: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    props.onSelectOption(props.pendingUserInput.requestId, question, value);
    if (!question.multiSelect && !progress.isLastQuestion) {
      clearAutoAdvance();
      autoAdvanceTimer.current = setTimeout(() => {
        autoAdvanceTimer.current = null;
        setRequestedIndex(questionIndex + 1);
      }, AUTO_ADVANCE_DELAY_MS);
    }
  };
  const submitButton = (
    <Button
      label="Submit answers"
      fullWidth
      tone={props.answers ? "primary" : "secondary"}
      disabled={!props.canOperateThread || responseDisabled || props.answers === null}
      onPress={() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        void props.onSubmit();
      }}
    />
  );
  const cardAnimatedStyle = useAnimatedStyle(() => {
    const progress = cardProgress.value;
    const travel = Platform.OS === "android" ? cardCoverage.value : cardHeight.value;
    return {
      maxHeight: maxHeight.value,
      opacity:
        Platform.OS === "android"
          ? Math.min(1, (progress * cardHeight.value) / Math.max(1, cardHeight.value - travel))
          : 1,
      transform: [{ translateY: (1 - progress) * travel }],
    };
  });
  // Android hit-tests inside the parent; its height is also the space the card takes below the feed.
  const androidBoundsStyle = useAnimatedStyle(() => ({
    paddingTop: cardCoverage.value * cardProgress.value,
  }));
  const overlayHeightStyle = useAnimatedStyle(() => ({ height: maxHeight.value }));

  const bar = (
    <View
      onLayout={handleBarLayout}
      pointerEvents={props.collapsed ? "auto" : "none"}
      accessibilityElementsHidden={!props.collapsed}
      importantForAccessibility={props.collapsed ? "auto" : "no-hide-descendants"}
      className="flex-row items-center gap-2 rounded-full border border-border bg-card-alt py-1.5 pl-4 pr-1.5"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          counter && activeQuestion
            ? `Expand question ${questionIndex + 1} of ${questionCount}, ${activeQuestion.header}`
            : `Expand question${activeQuestion ? `, ${activeQuestion.header}` : ""}`
        }
        onPress={props.onToggleCollapsed}
        className="min-h-10 flex-1 flex-row items-center gap-2 active:opacity-70"
      >
        <Text
          numberOfLines={1}
          className="min-w-0 shrink font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary"
        >
          {activeQuestion?.header ?? "Question"}
        </Text>
        {counter ? (
          <Text className="font-sans text-xs text-foreground-muted">· {counter}</Text>
        ) : null}
        <View className="flex-1" />
        <SymbolView
          name="chevron.up"
          size={12}
          tintColorClassName={"accent-icon-subtle"}
          type="monochrome"
        />
      </Pressable>
      {props.onStopThread ? (
        <ControlPill
          accessibilityLabel="Stop"
          icon="stop.fill"
          variant="danger"
          className="h-9 w-9"
          disabled={!props.canOperateThread}
          onPress={props.onStopThread}
        />
      ) : null}
    </View>
  );
  const card = (
    <Animated.View
      onLayout={handleCardLayout}
      pointerEvents={props.collapsed ? "none" : "auto"}
      accessibilityElementsHidden={props.collapsed}
      importantForAccessibility={props.collapsed ? "no-hide-descendants" : "auto"}
      className="overflow-hidden gap-2.5 rounded-[20px] border border-border bg-card-alt p-4"
      style={cardAnimatedStyle}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Collapse question"
        onPress={props.onToggleCollapsed}
        className="flex-row items-center gap-2"
      >
        <View className="min-w-0 flex-1 justify-center self-stretch">
          <Text
            numberOfLines={1}
            className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary"
            style={proseDirectionStyle(activeQuestion?.header ?? "", setDirection)}
          >
            {activeQuestion?.header ?? "Question"}
          </Text>
        </View>
        {counter ? (
          <Text className="self-center font-sans text-xs text-foreground-muted">{counter}</Text>
        ) : null}
        <View className="h-8 w-8 items-center justify-center rounded-full bg-subtle-strong">
          <SymbolView
            name="chevron.down"
            size={13}
            tintColorClassName={"accent-icon-subtle"}
            type="monochrome"
          />
        </View>
      </Pressable>
      <ScrollView
        bounces={false}
        className="min-h-0"
        contentContainerClassName="gap-2.5 pb-1"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        showsVerticalScrollIndicator
        style={{ flexShrink: 1 }}
      >
        {!canRespond ? (
          <Text className="font-sans text-sm leading-5 text-foreground-muted">
            The provider process for this request is no longer available. Interrupt or restart the
            run to continue.
          </Text>
        ) : null}
        {activeQuestion ? (
          <Animated.View
            key={activeQuestion.id}
            entering={FadeIn.duration(QUESTION_SWITCH_DURATION_MS)}
            className="gap-2 pt-1"
          >
            <QuestionText
              markdown={activeQuestion.question}
              environmentId={props.environmentId}
              setDirection={setDirection}
            />
            {activeQuestion.multiSelect ? (
              <Text className="font-sans text-xs text-foreground-muted">Select all that apply</Text>
            ) : null}
            <View className="gap-2">
              {activeQuestion.options.map((option) => {
                const optionValue = option.value ?? option.label.trim();
                const selected = isPendingUserInputOptionSelected(
                  activeQuestion,
                  progress.activeDraft,
                  optionValue,
                );
                const description =
                  option.description !== option.label ? option.description : undefined;
                return (
                  <Pressable
                    key={optionValue}
                    accessibilityRole={activeQuestion.multiSelect ? "checkbox" : "radio"}
                    accessibilityState={{ checked: selected, disabled: responseDisabled }}
                    disabled={responseDisabled}
                    className={cn(
                      "min-h-12 w-full flex-row items-center gap-3 rounded-2xl border px-3.5 py-3",
                      selected ? "border-primary bg-primary/10" : "border-border bg-input",
                    )}
                    onPress={() => handleSelectOption(activeQuestion, optionValue)}
                  >
                    <View
                      className={cn(
                        "h-5 w-5 items-center justify-center border",
                        activeQuestion.multiSelect ? "rounded-md" : "rounded-full",
                        selected ? "border-primary bg-primary" : "border-border",
                      )}
                    >
                      {selected ? (
                        activeQuestion.multiSelect ? (
                          <SymbolView
                            name="checkmark"
                            size={11}
                            tintColorClassName="accent-primary-foreground"
                            type="monochrome"
                          />
                        ) : (
                          <View className="h-2 w-2 rounded-full bg-primary-foreground" />
                        )
                      ) : null}
                    </View>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text
                        className={cn(
                          "font-t3-bold text-sm",
                          selected ? "text-foreground" : "text-foreground-secondary",
                        )}
                        style={proseDirectionStyle(option.label, setDirection)}
                      >
                        {option.label}
                      </Text>
                      {description ? (
                        <Text
                          className="font-sans text-sm leading-5 text-foreground-muted"
                          style={proseDirectionStyle(description, setDirection)}
                        >
                          {description}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {activeQuestion.allowCustomAnswer !== false ? (
              <QuestionAttachments
                key={`${props.pendingUserInput.requestId}:${activeQuestion.id}`}
                requestId={props.pendingUserInput.requestId}
                question={activeQuestion}
                questions={questions}
                disabled={responseDisabled}
                value={progress.customAnswer}
                onChangeText={(value) =>
                  props.onChangeCustomAnswer(
                    props.pendingUserInput.requestId,
                    activeQuestion.id,
                    value,
                  )
                }
                onInputFocusChange={props.onInputFocusChange}
              />
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>
      {questionCount > 1 && progress.isLastQuestion && props.answers === null ? (
        firstUnansweredIndex >= 0 && firstUnansweredIndex !== questionIndex ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => goToQuestion(firstUnansweredIndex)}
            className="active:opacity-70"
          >
            <Text className="font-sans text-xs text-foreground-muted">
              Answer question {firstUnansweredIndex + 1} to submit
            </Text>
          </Pressable>
        ) : null
      ) : null}
      {questionCount > 1 ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label="Back"
              fullWidth
              tone="text"
              disabled={questionIndex === 0}
              onPress={() => goToQuestion(questionIndex - 1)}
            />
          </View>
          <View className="flex-1">
            {progress.isLastQuestion ? (
              submitButton
            ) : (
              <Button
                label="Next"
                fullWidth
                tone={progress.canAdvance ? "primary" : "secondary"}
                disabled={responseDisabled || !progress.canAdvance}
                onPress={() => goToQuestion(questionIndex + 1)}
              />
            )}
          </View>
        </View>
      ) : (
        submitButton
      )}
      {props.pendingUserInput.dismissible ? (
        <Button
          label="Dismiss without answering"
          tone="text"
          disabled={isResponding}
          onPress={() => void props.onDismiss()}
        />
      ) : null}
      {!props.canOperateThread ? (
        <Text className="font-sans text-xs text-foreground-tertiary">
          This connection cannot submit answers.
        </Text>
      ) : null}
    </Animated.View>
  );
  return (
    <Animated.View
      className="relative"
      style={Platform.OS === "android" ? androidBoundsStyle : undefined}
    >
      {bar}
      <Animated.View
        pointerEvents={props.collapsed ? "none" : "box-none"}
        className="absolute inset-x-0 bottom-0 justify-end overflow-hidden"
        style={overlayHeightStyle}
      >
        {card}
      </Animated.View>
    </Animated.View>
  );
}
