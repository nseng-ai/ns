import { formatGrillAskProgressLine, type GrillAskProgress } from "./progress.ts";
import type { NormalizedGrillAskInput } from "./protocol.ts";

export const GRILL_UI_CONTRACT = `<structured-grill-question-ui-contract>
Preserve the grill-me behavior and reasoning style. The structured UI is only the interaction primitive for user-facing questions.

When you need user input during this grill session:
- Use the grill_ask tool for every user-facing grill question while it is available.
- Do not ask grill questions in freeform prose while grill_ask is available.
- Ask exactly one question per grill_ask call.
- If a fact can be found by exploring the codebase, look it up instead of asking. Decisions belong to the user — put each one through grill_ask and wait for the answer.
- Do not ask routine validation-scope or test-coverage questions; defer ordinary validation coverage to the implementing agent's project policy and changed-file judgment unless validation is itself a product/design requirement, release gate, or user-visible compatibility promise.
- Avoid double negatives and ambiguous option labels.
- Prefer affirmative, mutually exclusive options.
- Provide 2–5 substantive choices, not counting automatic freeform/status/end choices.
- Provide your recommended answer and rationale.
- Provide estimatedRemaining on every grill_ask call. Use exact only when you know; otherwise use a range with a basis or unknown with a basis. Do not invent precision.
- Always allow freeform unless there is a strong reason not to.
- Always allow ending the grilling session.
- Do not enact the plan until the user confirms shared understanding has been reached.
- If grill_ask returns action: "end-grill", stop asking questions and summarize decisions, unresolved branches, and final recommendation.
- If grill_ask returns action: "status-request", the user has not answered the current question. Produce a compact status report with answered count, estimated remaining questions, current pending question, resolved decisions, unresolved branches, and current recommendation. Then re-ask the exact same pending question with grill_ask; do not advance to a new question and do not count the status request as an answer.
- If grill_ask is unavailable or returns action: "ui-unavailable", ask the same one question normally with numbered choices, including Other/freeform when allowed, Show current grill status, and End grilling session when allowed.
</structured-grill-question-ui-contract>`;

export function buildGrillUiPrompt(skillBlock: string, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, target);
}

export function buildGrillWithDocsUiPrompt(skillBlock: string, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, target);
}

export function buildGrillAskSelectTitle(
	input: NormalizedGrillAskInput,
	progress: GrillAskProgress = { source: "unavailable" },
): string {
	const parts = [
		formatGrillAskProgressLine(progress, input.estimatedRemaining),
		`Question:\n${input.question}`,
	];
	if (input.context !== undefined) {
		parts.push(`Context:\n${input.context}`);
	}
	parts.push(`Recommended answer:\n${input.recommended.answer}`);
	if (input.recommended.rationale !== undefined) {
		parts.push(`Recommendation rationale:\n${input.recommended.rationale}`);
	}
	return parts.join("\n\n");
}

function buildStructuredGrillPrompt(skillBlock: string, target: string): string {
	return `${skillBlock.trim()}

${GRILL_UI_CONTRACT}

<plan-or-design-to-grill>
${target.trim()}
</plan-or-design-to-grill>`;
}
