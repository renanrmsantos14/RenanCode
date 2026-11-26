import type {
  EnvironmentId,
  QuestionPlacement,
  RuntimeRequestId,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { useGT, useMessages } from "gt-react";
import { MessageCircleQuestion } from "lucide-react";
import type { PendingUserInput } from "../../session-logic";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Textarea } from "../ui/textarea";
import { ComposerBanner } from "./ComposerBanner";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import { formatPendingPrimaryActionLabel } from "./ComposerPrimaryActions";
import { usePendingUserInputDraft } from "./usePendingThreadRequests";

export function QuestionsSidePanel(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly threadRef: ScopedThreadRef;
  readonly cwd: string | undefined;
  /** Empty while the open question is answered in the composer. */
  readonly pendingUserInputs: PendingUserInput[];
  readonly supportsQuestionAttachments: boolean;
  readonly disabled: boolean;
  readonly isResponding: boolean;
  readonly respondingRequestIds: RuntimeRequestId[];
  readonly onToggleOption: (questionId: string, optionValue: string) => void;
  readonly onChangeCustomAnswer: (questionId: string, value: string) => void;
  readonly onAdvance: () => void;
  readonly onPrevious: () => void;
  readonly onDismiss: (requestId: RuntimeRequestId) => void;
  readonly onMove: (requestId: RuntimeRequestId, placement: QuestionPlacement) => void;
}) {
  const gt = useGT();
  const m = useMessages();
  const activePendingUserInput = props.pendingUserInputs[0] ?? null;
  const { activePendingProgress, activePendingDraftAnswers, activePendingQuestionIndex } =
    usePendingUserInputDraft({
      environmentId: props.environmentId,
      activeThreadId: props.threadId,
      activePendingUserInput,
      supportsQuestionAttachments: props.supportsQuestionAttachments,
    });
  const activeQuestion = activePendingProgress?.activeQuestion;

  if (!activePendingUserInput || !activePendingProgress || !activeQuestion) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageCircleQuestion />
          </EmptyMedia>
          <EmptyTitle>{gt("No questions here")}</EmptyTitle>
          <EmptyDescription>
            {gt("Questions from the agent show up here when they open in the side panel.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const responding =
    props.isResponding || props.respondingRequestIds.includes(activePendingUserInput.requestId);
  const locked = props.disabled || responding;
  const canAdvance =
    !locked &&
    activePendingUserInput.responseCapability !== "not_resumable" &&
    activePendingProgress.canAdvance;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <ComposerBanner.Root variant="info" detached>
        <ComposerPendingUserInputPanel
          pendingUserInputs={props.pendingUserInputs}
          cwd={props.cwd}
          threadRef={props.threadRef}
          disabled={props.disabled}
          respondingRequestIds={
            responding
              ? [...props.respondingRequestIds, activePendingUserInput.requestId]
              : props.respondingRequestIds
          }
          answers={activePendingDraftAnswers}
          questionIndex={activePendingQuestionIndex}
          onToggleOption={props.onToggleOption}
          onAdvance={props.onAdvance}
          onDismiss={props.onDismiss}
          moveTo="composer"
          onMove={props.onMove}
        />
      </ComposerBanner.Root>
      {activeQuestion.allowCustomAnswer === false ? null : (
        <Textarea
          key={`${activePendingUserInput.requestId}:${activeQuestion.id}`}
          value={activePendingProgress.customAnswer}
          disabled={locked}
          placeholder={gt("Type your own answer, or leave this blank to use the selected option")}
          aria-label={gt("Your own answer")}
          data-pending-user-input-custom-answer
          onChange={(event) => props.onChangeCustomAnswer(activeQuestion.id, event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (canAdvance) props.onAdvance();
          }}
        />
      )}
      <div className="flex items-center justify-end gap-2">
        {activePendingQuestionIndex > 0 ? (
          <Button variant="ghost" size="sm" disabled={locked} onClick={props.onPrevious}>
            {gt("Back", { $context: "button that goes to the previous question" })}
          </Button>
        ) : null}
        <Button size="sm" disabled={!canAdvance} onClick={props.onAdvance}>
          {formatPendingPrimaryActionLabel(
            {
              compact: false,
              isLastQuestion: activePendingProgress.isLastQuestion,
              isResponding: responding,
              questionIndex: activePendingQuestionIndex,
            },
            m,
          )}
        </Button>
      </div>
    </div>
  );
}
