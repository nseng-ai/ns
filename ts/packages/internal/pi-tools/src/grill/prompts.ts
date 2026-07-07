import { GRILL_UI_SKILL_NAME, GRILL_WITH_DOCS_UI_SKILL_NAME } from "@nseng-ai/pi/grill/surfaces";

import { formatGrillAskProgressLine, type GrillAskProgress } from "./progress.ts";
import type { NormalizedGrillAskInput } from "./protocol.ts";

export const FALLBACK_GRILL_UI_SKILL_BLOCK = `<skill name="${GRILL_UI_SKILL_NAME}" fallback="true">
This fallback is the Pi structured-UI complement to the portable grilling loop. It is self-contained; do not rely on a separate /grilling skill expansion for core behavior.

Interview the user relentlessly about every aspect of the plan or design until reaching shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask exactly one user-facing question at a time. Use grill_ask for user-facing grill questions when available, with 2-5 affirmative mutually exclusive options, a recommendation and rationale, estimatedRemaining, freeform/status/end paths, and status-request handling that re-asks the same pending question.

If a question can be answered by exploring the codebase, explore the codebase instead.

Do not ask routine validation-scope or test-coverage questions; defer ordinary validation coverage to the implementing agent's project policy and changed-file judgment. Only ask about validation when it is a product/design requirement, release gate, or user-visible compatibility promise.
</skill>`;

export const FALLBACK_GRILL_WITH_DOCS_UI_SKILL_BLOCK = `<skill name="${GRILL_WITH_DOCS_UI_SKILL_NAME}" fallback="true">
This fallback is the Pi structured-UI complement to portable grilling plus domain-modeling. It is self-contained; do not rely on separate /grilling or /domain-modeling skill expansion for core behavior.

Interview the user relentlessly about the plan or design while challenging it against the repository's documented domain language.

Before the first user-facing question, do a bounded docs-first preflight: check CONTEXT-MAP.md if present, check root or relevant CONTEXT.md files, check relevant docs/adr/ records, and inspect code only when the target names a concrete area or a claim needs verification.

Ask exactly one user-facing question at a time. Use grill_ask for user-facing grill questions when available, with 2-5 affirmative mutually exclusive options, a recommendation and rationale, estimatedRemaining, freeform/status/end paths, and status-request handling that re-asks the same pending question. Explore the codebase instead of asking when the answer can be discovered.

Do not ask routine validation-scope or test-coverage questions; defer ordinary validation coverage to the implementing agent's project policy and changed-file judgment. Only ask about validation when it is a product/design requirement, release gate, or user-visible compatibility promise.

Challenge glossary conflicts immediately, sharpen fuzzy terms into canonical project language, and update CONTEXT.md inline when a term is resolved. Keep CONTEXT.md as a glossary only, without implementation details.

Offer ADRs sparingly only when all three are true: the decision is hard to reverse, surprising without context, and the result of a real trade-off.

When reporting status, include a Documentation updates line summarizing CONTEXT.md edits, ADRs created or offered, or none yet.
</skill>`;

export const GRILL_UI_CONTRACT = `<structured-grill-question-ui-contract>
Preserve the grill-me behavior and reasoning style. The structured UI is only the interaction primitive for user-facing questions.

When you need user input during this grill session:
- Use the grill_ask tool for every user-facing grill question while it is available.
- Do not ask grill questions in freeform prose while grill_ask is available.
- Ask exactly one question per grill_ask call.
- Explore the codebase instead of asking when the answer can be discovered.
- Do not ask routine validation-scope or test-coverage questions; defer ordinary validation coverage to the implementing agent's project policy and changed-file judgment unless validation is itself a product/design requirement, release gate, or user-visible compatibility promise.
- Avoid double negatives and ambiguous option labels.
- Prefer affirmative, mutually exclusive options.
- Provide 2–5 substantive choices, not counting automatic freeform/status/end choices.
- Provide your recommended answer and rationale.
- Provide estimatedRemaining on every grill_ask call. Use exact only when you know; otherwise use a range with a basis or unknown with a basis. Do not invent precision.
- Always allow freeform unless there is a strong reason not to.
- Always allow ending the grilling session.
- If grill_ask returns action: "end-grill", stop asking questions and summarize decisions, unresolved branches, and final recommendation.
- If grill_ask returns action: "status-request", the user has not answered the current question. Produce a compact status report with answered count, estimated remaining questions, current pending question, resolved decisions, unresolved branches, and current recommendation. Then re-ask the exact same pending question with grill_ask; do not advance to a new question and do not count the status request as an answer.
- If grill_ask is unavailable or returns action: "ui-unavailable", ask the same one question normally with numbered choices, including Other/freeform when allowed, Show current grill status, and End grilling session when allowed.
</structured-grill-question-ui-contract>`;

export function buildGrillUiPrompt(skillBlock: string | undefined, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, FALLBACK_GRILL_UI_SKILL_BLOCK, target);
}

export function buildGrillWithDocsUiPrompt(skillBlock: string | undefined, target: string): string {
	return buildStructuredGrillPrompt(skillBlock, FALLBACK_GRILL_WITH_DOCS_UI_SKILL_BLOCK, target);
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

function buildStructuredGrillPrompt(
	skillBlock: string | undefined,
	fallbackSkillBlock: string,
	target: string,
): string {
	const instructions = skillBlock?.trim() || fallbackSkillBlock;
	return `${instructions}

${GRILL_UI_CONTRACT}

<plan-or-design-to-grill>
${target.trim()}
</plan-or-design-to-grill>`;
}
