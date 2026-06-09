import type { GrillAskRemainingEstimate, ToolResult } from "../grill-ui.ts";
import { formatRemainingEstimate, type GrillAskProgress, type GrillAskProgressSource } from "./progress.ts";
import type { GrillAskChoiceRow } from "./view.ts";

export type GrillAskDetails =
	| {
			action: "answer";
			kind: "choice";
			question: string;
			value: string;
			label: string;
			description?: string;
			recommended: boolean;
	  }
	| {
			action: "answer";
			kind: "freeform";
			question: string;
			answer: string;
	  }
	| {
			action: "end_grill";
			question: string;
	  }
	| {
			action: "status_request";
			question: string;
			answeredQuestions?: number;
			progressSource: GrillAskProgressSource;
			estimatedRemaining?: GrillAskRemainingEstimate;
	  }
	| {
			action: "cancelled";
			question: string;
	  }
	| {
			action: "ui_unavailable";
			question: string;
	  }
	| {
			action: "invalid_tool_input";
			errors: string[];
	  };

export const CANCELLED_GRILL_MESSAGE =
	"User cancelled the structured grill question. Do not silently continue grilling as though an answer was provided; summarize what is known or ask whether to continue.";

export function freeformAnswerResult(question: string, answer: string): ToolResult<GrillAskDetails> {
	const trimmedAnswer = answer.trim();
	return textResult(`User provided a freeform answer: ${trimmedAnswer}`, {
		action: "answer",
		kind: "freeform",
		question,
		answer: trimmedAnswer,
	});
}

export function endGrillResult(question: string): ToolResult<GrillAskDetails> {
	return textResult(
		"User chose to end the grilling session. Stop asking questions and summarize resolved decisions, unresolved branches, and your final recommendation.",
		{ action: "end_grill", question },
	);
}

export function selectedChoiceResult(question: string, selectedEntry: GrillAskChoiceRow): ToolResult<GrillAskDetails> {
	const details: GrillAskDetails = {
		action: "answer",
		kind: "choice",
		question,
		value: selectedEntry.option.value,
		label: selectedEntry.option.label,
		...(selectedEntry.option.description === undefined ? {} : { description: selectedEntry.option.description }),
		recommended: selectedEntry.recommended,
	};
	return textResult(
		[
			`User selected option \`${selectedEntry.option.value}\`: ${selectedEntry.option.label}`,
			`Recommended option selected: ${selectedEntry.recommended ? "true" : "false"}`,
		].join("\n"),
		details,
	);
}

export function statusRequestResult(
	question: string,
	progress: GrillAskProgress,
	estimate: GrillAskRemainingEstimate | undefined,
): ToolResult<GrillAskDetails> {
	return textResult(
		[
			"User requested a grill status checkpoint. This is not an answer to the pending question.",
			"",
			`Answered count: ${formatAnsweredCount(progress)}`,
			`Remaining estimate: ${formatRemainingEstimate(estimate)}`,
			"",
			"Produce this compact report:",
			"",
			"## Grill status",
			"",
			"Answered: <use the exact count above when available; otherwise say unknown>",
			"Estimated remaining: <use the exact remaining estimate above, including uncertainty/basis; revise only if you have a clear reason>",
			"",
			"Current pending question:",
			`- ${question}`,
			"",
			"Decisions so far:",
			"- <resolved decision, or none yet>",
			"",
			"Still open:",
			"- <unresolved branch or decision, or none yet>",
			"",
			"Recommendation:",
			"- <current best next step for the grilling session>",
			"",
			"After the report, call grill_ask again with the same pending question, context, recommendation, options, allowFreeform, and allowEnd. Do not advance to a new question and do not count this status request as an answer.",
		].join("\n"),
		{
			action: "status_request",
			question,
			...(progress.answeredQuestions === undefined ? {} : { answeredQuestions: progress.answeredQuestions }),
			progressSource: progress.source,
			...(estimate === undefined ? {} : { estimatedRemaining: estimate }),
		},
	);
}

export function invalidToolInputResult(errors: string[]): ToolResult<GrillAskDetails> {
	return textResult(
		`Invalid grill_ask input:\n${errors.map((error) => `- ${error}`).join("\n")}\nRepair the tool call with one non-empty question, a recommendation, and 2–5 valid explicit choices.`,
		{
			action: "invalid_tool_input",
			errors,
		},
	);
}

export function cancelledResult(question: string, text: string = CANCELLED_GRILL_MESSAGE): ToolResult<GrillAskDetails> {
	return textResult(text, { action: "cancelled", question });
}

function formatAnsweredCount(progress: GrillAskProgress): string {
	if (progress.answeredQuestions === undefined) return "unavailable from session evidence.";
	const noun = progress.answeredQuestions === 1 ? "question" : "questions";
	if (progress.source === "session_branch") {
		return `${progress.answeredQuestions} answered grill ${noun} so far from the current Pi session branch, scoped to the latest /grill-ui kickoff.`;
	}
	return `${progress.answeredQuestions} answered grill ${noun} so far from the current Pi session branch (best effort; no /grill-ui kickoff marker found).`;
}

export function textResult<Details extends GrillAskDetails>(text: string, details: Details): ToolResult<Details> {
	return {
		content: [{ type: "text", text }],
		details,
	};
}
