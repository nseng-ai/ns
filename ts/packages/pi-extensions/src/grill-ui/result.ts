import type { ToolResult } from "../grill-ui.ts";
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

export function textResult<Details extends GrillAskDetails>(text: string, details: Details): ToolResult<Details> {
	return {
		content: [{ type: "text", text }],
		details,
	};
}
