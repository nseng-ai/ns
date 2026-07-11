/**
 * Model-facing texts for the grill side-quest workflow: tool-result texts,
 * the command-path kickoff message with its machine-readable marker, the
 * resume message, per-disposition branch-summary instructions, and the
 * delimited contract block spliced into GRILL_UI_CONTRACT.
 */

export const GRILL_SIDEQUEST_KICKOFF_MARKER_OPEN = "<grill-sidequest-start>";
export const GRILL_SIDEQUEST_KICKOFF_MARKER_CLOSE = "</grill-sidequest-start>";

export const SIDE_QUEST_DISPOSITIONS = ["fold-in", "note", "discard"] as const;
export type SideQuestDisposition = (typeof SIDE_QUEST_DISPOSITIONS)[number];

const MARK_LABEL_QUESTION_MAX_CHARS = 48;

export function buildSideQuestStartedText(topic: string, question: string): string {
	return [
		`Side quest started: \`${topic}\`.`,
		"",
		`Grilling is paused. The pending question was: ${question}`,
		"This side quest is NOT an answer to that question.",
		"",
		"Engage the side-quest topic conversationally. Do not call grill_ask again until the user returns from the side quest.",
	].join("\n");
}

export function buildSideQuestRefusedText(topic: string, activeTopic: string): string {
	return [
		`Side quest refused: a side quest is already active (\`${activeTopic}\`). Only one side quest can be active at a time.`,
		`Tell the user to return from the active side quest first — jump to the ⚑ mark in the session tree or run /pi:grill-return — and then retry \`sq: ${topic}\` if it is still wanted.`,
		"This refusal is NOT an answer to the pending question; re-ask the same pending question with grill_ask.",
	].join("\n");
}

export function buildSideQuestKickoffMessage(
	topic: string,
	pendingQuestion: string | undefined,
): string {
	const pendingLine =
		pendingQuestion === undefined
			? "No grill question was pending; when this side quest returns, continue the interview where it left off."
			: `Grilling is paused. The pending question was: ${pendingQuestion}\nThis side quest is NOT an answer to that question.`;
	return [
		GRILL_SIDEQUEST_KICKOFF_MARKER_OPEN,
		topic,
		GRILL_SIDEQUEST_KICKOFF_MARKER_CLOSE,
		"",
		`Side quest started: \`${topic}\`.`,
		"",
		pendingLine,
		"",
		"Engage the side-quest topic conversationally. Do not call grill_ask again until the user returns from the side quest.",
	].join("\n");
}

export function buildSideQuestResumeMessage(
	topic: string,
	pendingQuestion: string | undefined,
): string {
	const reAskLine =
		pendingQuestion === undefined
			? "Continue the interview where it left off and re-ask the current question via grill_ask."
			: `Re-ask the pending question verbatim via grill_ask: ${pendingQuestion}`;
	return [
		`Side quest \`${topic}\` is finished; we are back at the grilling interview.`,
		reAskLine,
		"If the side-quest summary warrants it, revise your recommendation or options and say why.",
		"The side quest was not an answer to the pending question.",
	].join("\n");
}

export function sideQuestSummaryInstructions(mode: "fold-in" | "note"): string {
	if (mode === "fold-in") {
		return "Summarize the side conversation for the grilling interview it branched from: capture every decision, fact, constraint, or design implication that should influence the plan under discussion, in concrete detail. Attribute decisions the user made explicitly as user decisions.";
	}
	return "Summarize the side conversation in one or two sentences: what was explored and whether anything material changed. Name any artifacts created during the side quest (handoffs, saved plans, files).";
}

export function buildSideQuestMarkLabel(question: string): string {
	return `⚑ side quest base · ${truncateSingleLine(question, MARK_LABEL_QUESTION_MAX_CHARS)}`;
}

export function buildSideQuestReturnLabel(topic: string): string {
	return `side quest: ${truncateSingleLine(topic, MARK_LABEL_QUESTION_MAX_CHARS)}`;
}

export const SIDE_QUEST_DISPOSITION_CHOICES = {
	"fold-in": "Fold in — carry decisions, facts, and constraints into the interview",
	note: "Note — one or two sentences on what was explored",
	discard: "Discard — return with no summary",
} as const satisfies Record<SideQuestDisposition, string>;

export function sideQuestDispositionFromChoice(
	choice: string | undefined,
): SideQuestDisposition | undefined {
	if (choice === undefined) return undefined;
	return SIDE_QUEST_DISPOSITIONS.find(
		(disposition) => SIDE_QUEST_DISPOSITION_CHOICES[disposition] === choice,
	);
}

export const GRILL_SIDEQUEST_CONTRACT_BLOCK = `<grill-side-quest-contract>
Side quests: the user can pause the interview to explore a tangent before answering.
- If grill_ask returns action: "side-quest", pause the interview. Engage the side-quest topic conversationally and do not call grill_ask again until the user returns from the side quest.
- If grill_ask returns action: "side-quest-refused", a side quest is already active; remind the user to return from it first, then re-ask the same pending question.
- When a side-quest resume message arrives, re-ask the pending question verbatim via grill_ask. If the side-quest branch summary warrants it, revise your recommendation or options and say why. The side quest was not an answer.
- If the user seems to want to explore a tangent instead of answering, mention they can type sq: <topic> in the freeform path to start a side quest.
</grill-side-quest-contract>`;

export function truncateSingleLine(value: string, maxLength: number): string {
	const singleLine = value.replace(/\s+/g, " ").trim();
	if (singleLine.length <= maxLength) return singleLine;
	return `${singleLine.slice(0, maxLength - 1)}…`;
}
