import type { GrillAskRemainingEstimate, GrillAskToolContext } from "../grill-ui.ts";

export type GrillAskProgressSource = "session_branch" | "session_branch_unscoped" | "unavailable";

export interface GrillAskProgress {
	answeredQuestions?: number;
	source: GrillAskProgressSource;
}

const GRILL_ASK_TOOL_NAME = "grill_ask";
const GRILL_UI_KICKOFF_MARKERS = [
	"<structured-grill-question-ui-contract>",
	"<plan-or-design-to-grill>",
] as const;
const COMPACT_BASIS_MAX_LENGTH = 64;

export function formatGrillAskProgressLine(
	progress: GrillAskProgress,
	estimate: GrillAskRemainingEstimate | undefined,
): string {
	return [formatQuestionProgress(progress), formatRemainingEstimate(estimate, "compact")].join(
		" • ",
	);
}

export function formatRemainingEstimate(
	estimate: GrillAskRemainingEstimate | undefined,
	basisMode: "compact" | "full" = "full",
): string {
	if (estimate === undefined) return "Remaining unknown (estimate not supplied)";

	switch (estimate.kind) {
		case "exact":
			return appendBasis(`Remaining ${estimate.count}`, estimate.basis, "basis", basisMode);
		case "range":
			return appendBasis(
				`Remaining ${estimate.min}–${estimate.max}`,
				estimate.basis,
				"rough",
				basisMode,
			);
		case "unknown":
			return appendBasis("Remaining unknown", estimate.basis, "why", basisMode);
		default: {
			const exhaustive: never = estimate;
			return exhaustive;
		}
	}
}

function formatQuestionProgress(progress: GrillAskProgress): string {
	if (progress.answeredQuestions === undefined) return "Question unknown • Answered unknown";
	return `Question ${progress.answeredQuestions + 1} • Answered ${progress.answeredQuestions}`;
}

function appendBasis(
	value: string,
	basis: string | undefined,
	label: string,
	basisMode: "compact" | "full",
): string {
	if (basis === undefined) return value;
	const renderedBasis = basisMode === "compact" ? compactBasis(basis) : basis;
	return `${value} (${label}: ${renderedBasis})`;
}

function compactBasis(value: string): string {
	const trimmed = value.replace(/\s+/g, " ").trim();
	if (trimmed.length <= COMPACT_BASIS_MAX_LENGTH) return trimmed;
	return `${trimmed.slice(0, COMPACT_BASIS_MAX_LENGTH - 1)}…`;
}

export function readGrillAskProgress(ctx: GrillAskToolContext): GrillAskProgress {
	const sessionManager = ctx.sessionManager;
	if (sessionManager === undefined) return { source: "unavailable" };

	let branch: readonly unknown[];
	try {
		branch = sessionManager.getBranch();
	} catch {
		return { source: "unavailable" };
	}

	if (!Array.isArray(branch)) return { source: "unavailable" };

	const kickoffIndex = latestKickoffIndex(branch);
	const startIndex = kickoffIndex === undefined ? 0 : kickoffIndex + 1;
	const answeredQuestions = countAnswerResults(branch, startIndex);
	return {
		answeredQuestions,
		source: kickoffIndex === undefined ? "session_branch_unscoped" : "session_branch",
	};
}

function latestKickoffIndex(entries: readonly unknown[]): number | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (isKickoffEntry(entries[index])) return index;
	}
	return undefined;
}

function countAnswerResults(entries: readonly unknown[], startIndex: number): number {
	let count = 0;
	for (let index = startIndex; index < entries.length; index += 1) {
		if (isGrillAskAnswerResult(entries[index])) count += 1;
	}
	return count;
}

function isKickoffEntry(entry: unknown): boolean {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "user") return false;
	const text = textFromContent(message.content);
	return GRILL_UI_KICKOFF_MARKERS.some((marker) => text.includes(marker));
}

function isGrillAskAnswerResult(entry: unknown): boolean {
	const message = messageFromEntry(entry);
	if (!isRecord(message)) return false;
	if (message.role !== "toolResult") return false;
	if (message.toolName !== GRILL_ASK_TOOL_NAME) return false;
	if (!isRecord(message.details)) return false;
	return message.details.action === "answer";
}

function messageFromEntry(entry: unknown): unknown {
	if (!isRecord(entry) || entry.type !== "message") return undefined;
	return entry.message;
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const textParts: string[] = [];
	for (const item of content) {
		if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
			textParts.push(item.text);
		}
	}
	return textParts.join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
