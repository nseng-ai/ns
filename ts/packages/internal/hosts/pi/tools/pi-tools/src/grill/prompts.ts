import { formatGrillKickoffMarker } from "@nseng-ai/pi-runtime/grill/surfaces";

import { formatGrillAskProgressLine, type GrillAskProgress } from "./progress.ts";
import type { NormalizedGrillAskInput } from "./protocol.ts";

export const GRILL_UI_CONTRACT = `<structured-grill-round-ui-contract>
Preserve the grilling reasoning style. Model the subject as a design tree and work it in atomic rounds.

Protocol:
- Finding facts is your job. Explore the codebase or dispatch available research; never ask the user for a discoverable fact.
- The frontier is every unresolved decision whose prerequisites are settled. Recompute it after each submitted round.
- In decision-round mode call grill_ask_round once with the whole current frontier, in dependency/design-tree order. Never split an answerable frontier into arbitrary subsets.
- Every attempt-scoped roundId and question id must be stable and unique. A kickoff starts a new ID namespace; never reuse IDs within it.
- Each question must provide 2–5 substantive, affirmative, mutually exclusive choices, exactly one recommended choice, a concise recommendation rationale, and the UI's freeform path.
- Frame each decision so accepting the recommendation has uniform positive polarity. Do not use double negatives or pair a recommended “no” with “Do you agree?”.
- A decision whose answer depends on another unresolved decision is not on this frontier; defer it to a later round.
- A submitted round is atomic. Use its ordered answers to reshape the tree, report a compact between-round status, then recompute the complete frontier.
- Between-round status must state submitted round count, answered decision count, resolved decisions, unresolved branches, and current recommendation.
- In docs-aware grilling, every between-round status and the final pre-confirmation report must include an exact \`Documentation updates:\` line describing proposed vocabulary, synchronized CONTEXT.md corrections, ADRs created/offered, or \`none yet\`.
- General /pi grilling has no decision-round cap. Continue until the frontier is empty.
- Cancel pauses the current general grill attempt and discards the pending round draft; do not confirm or take downstream action from the cancelled state. A later decision round may resume the same attempt without reserving the cancelled IDs. End terminates the attempt. UI failure, duplicate evidence, or any ambiguous terminal result fails closed. Invalid calls reserve no IDs and may be repaired in general grilling.
- When the frontier is empty, call grill_ask_round in confirmation mode with an explicit summary of the shared understanding, resolved decisions, caveats, and final recommendation.
- Final confirmation offers only “Confirm shared understanding” and “Return to grilling”. If the user returns, reshape the tree and recompute the whole frontier.
- Do not enact, save, implement, or otherwise take downstream action unless the latest attempt has explicit confirmed evidence.
- Do not fall back to prose questions if grill_ask_round is unavailable or fails. Explain that structured round UI is required and stop.
- Do not ask routine validation-scope or test-coverage questions unless validation is itself a product requirement, release gate, or user-visible compatibility promise.
</structured-grill-round-ui-contract>`;

export function buildGrillAskSelectTitle(
	input: NormalizedGrillAskInput,
	progress: GrillAskProgress = { source: "unavailable" },
): string {
	const parts = [
		formatGrillAskProgressLine(progress, input.estimatedRemaining),
		`Question:\n${input.question}`,
	];
	if (input.context !== undefined) parts.push(`Context:\n${input.context}`);
	parts.push(`Recommended answer:\n${input.recommended.answer}`);
	if (input.recommended.rationale !== undefined) {
		parts.push(`Recommendation rationale:\n${input.recommended.rationale}`);
	}
	return parts.join("\n\n");
}

export function buildGrillUiPrompt(skillBlock: string, target: string, attemptId: string): string {
	return buildStructuredGrillPrompt(skillBlock, target, attemptId);
}

export function buildGrillWithDocsUiPrompt(
	skillBlock: string,
	target: string,
	attemptId: string,
): string {
	return buildStructuredGrillPrompt(skillBlock, target, attemptId);
}

function buildStructuredGrillPrompt(skillBlock: string, target: string, attemptId: string): string {
	const kickoff = formatGrillKickoffMarker({
		version: 1,
		attemptId,
		policy: { kind: "general" },
	});
	return `${skillBlock.trim()}

${GRILL_UI_CONTRACT}

${kickoff}

This kickoff resets the attempt-scoped round and question ID namespace. Its general policy is unlimited.

<plan-or-design-to-grill>
${target.trim()}
</plan-or-design-to-grill>`;
}
