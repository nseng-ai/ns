import { z } from "zod";

export const GRILL_UI_COMMAND_NAME = "pi:grill-me";
export const GRILL_WITH_DOCS_UI_COMMAND_NAME = "pi:grill-with-docs";
export const GRILL_ASK_TOOL_NAME = "grill_ask";
/** Additive protocol name. It is intentionally not registered until the command cutover. */
export const GRILL_ASK_ROUND_TOOL_NAME = "grill_ask_round";
export const GRILL_UI_SKILL_NAME = "pi-grill-ui";
export const GRILL_WITH_DOCS_UI_SKILL_NAME = "pi-grill-with-docs-ui";
export const GRILL_KICKOFF_VERSION = 1;
export const GRILL_KICKOFF_MARKER_START = "<ns-grill-kickoff>";
export const GRILL_KICKOFF_MARKER_END = "</ns-grill-kickoff>";

const grillKickoffEvidenceSchema = z.lazy(() =>
	z.strictObject({
		version: z.literal(GRILL_KICKOFF_VERSION),
		attemptId: z.string().trim().min(1),
		policy: z.discriminatedUnion("kind", [
			z.strictObject({ kind: z.literal("general") }),
			z.strictObject({
				kind: z.literal("saved-plan"),
				maxDecisionRounds: z.literal(5),
			}),
		]),
	}),
);

export type GrillKickoffEvidence = z.infer<typeof grillKickoffEvidenceSchema>;

const roundAnswerEvidenceSchema = z.lazy(() =>
	z.strictObject({
		questionId: z.string().trim().min(1),
		kind: z.enum(["option", "freeform"]),
		value: z.string().trim().min(1),
		label: z.string().trim().min(1).optional(),
		recommendation: z.enum(["retained", "changed"]),
	}),
);

const submittedRoundSchema = z.lazy(() =>
	z.strictObject({
		action: z.literal("submitted"),
		mode: z.literal("decision-round"),
		roundId: z.string().trim().min(1),
		answers: z.array(roundAnswerEvidenceSchema).min(1),
		submittedRoundCount: z.number().int().positive(),
		answeredDecisionCount: z.number().int().positive(),
	}),
);

const terminalRoundSchema = z.lazy(() =>
	z.strictObject({
		action: z.enum(["cancelled", "ended", "ui-failed", "cap-exhausted"]),
		mode: z.literal("decision-round"),
		roundId: z.string().trim().min(1),
	}),
);

const confirmationSchema = z.lazy(() =>
	z.strictObject({
		action: z.enum(["confirmed", "return-to-grilling", "ui-failed"]),
		mode: z.literal("confirmation"),
	}),
);

const invalidRoundInputSchema = z.lazy(() =>
	z.strictObject({
		action: z.literal("invalid-tool-input"),
		errors: z.array(z.string()),
	}),
);

const grillRoundResultEvidenceSchema = z.lazy(() =>
	z.union([submittedRoundSchema, terminalRoundSchema, confirmationSchema, invalidRoundInputSchema]),
);

export type GrillRoundResultEvidence = z.infer<typeof grillRoundResultEvidenceSchema>;

export type GrillAttemptStatus =
	| "none"
	| "active"
	| "confirmed"
	| "ended"
	| "cancelled"
	| "ui-failed"
	| "cap-exhausted"
	| "invalid";

export interface GrillAttemptEvaluation {
	status: GrillAttemptStatus;
	kickoff?: GrillKickoffEvidence;
	submittedRoundCount: number;
	answeredDecisionCount: number;
	submittedRoundIds: ReadonlySet<string>;
	submittedQuestionIds: ReadonlySet<string>;
	hasDuplicateIds: boolean;
	/** Conservative downstream authorization: only an unambiguous confirmation grants it. */
	authorized: boolean;
}

/** Encode stable machine evidence for inclusion in a structured-grill kickoff prompt. */
export function formatGrillKickoffMarker(evidence: GrillKickoffEvidence): string {
	const parsed = grillKickoffEvidenceSchema.parse(evidence);
	return `${GRILL_KICKOFF_MARKER_START}${JSON.stringify(parsed)}${GRILL_KICKOFF_MARKER_END}`;
}

/**
 * Reconstruct stable protocol facts from the actual Pi branch message serialization.
 * Malformed entries never grant authorization. A fork/resume naturally works because
 * `getBranch()` supplies only the selected branch ancestry.
 */
export function evaluateGrillAttempt(entries: readonly unknown[]): GrillAttemptEvaluation {
	const kickoff = findLatestKickoff(entries);
	if (kickoff === undefined) return emptyEvaluation("none");

	const roundIds = new Set<string>();
	const questionIds = new Set<string>();
	let submittedRoundCount = 0;
	let answeredDecisionCount = 0;
	let status: GrillAttemptStatus = "active";
	let hasDuplicateIds = false;
	let malformedResult = false;

	for (let index = kickoff.index + 1; index < entries.length; index += 1) {
		const snapshot = resultSnapshot(entries[index]);
		if (snapshot === undefined) continue;
		if (snapshot === "malformed") {
			malformedResult = true;
			continue;
		}
		if (snapshot.action === "invalid-tool-input") continue;
		if (snapshot.mode === "decision-round" && snapshot.action === "submitted") {
			if (isTerminalStatus(status)) continue;
			if (roundIds.has(snapshot.roundId)) hasDuplicateIds = true;
			roundIds.add(snapshot.roundId);
			const localQuestionIds = new Set<string>();
			for (const answer of snapshot.answers) {
				if (localQuestionIds.has(answer.questionId) || questionIds.has(answer.questionId)) {
					hasDuplicateIds = true;
				}
				localQuestionIds.add(answer.questionId);
				questionIds.add(answer.questionId);
			}
			submittedRoundCount += 1;
			answeredDecisionCount += snapshot.answers.length;
			status = "active";
			continue;
		}
		if (!isTerminalStatus(status)) status = statusFromResult(snapshot.action);
	}

	if (hasDuplicateIds || malformedResult) status = "invalid";

	return {
		status,
		kickoff: kickoff.evidence,
		submittedRoundCount,
		answeredDecisionCount,
		submittedRoundIds: roundIds,
		submittedQuestionIds: questionIds,
		hasDuplicateIds,
		authorized: status === "confirmed" && !hasDuplicateIds && !malformedResult,
	};
}

function findLatestKickoff(
	entries: readonly unknown[],
): { index: number; evidence: GrillKickoffEvidence } | undefined {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const text = userMessageText(entries[index]);
		if (text === undefined) continue;
		const start = text.lastIndexOf(GRILL_KICKOFF_MARKER_START);
		if (start < 0) continue;
		const contentStart = start + GRILL_KICKOFF_MARKER_START.length;
		const end = text.indexOf(GRILL_KICKOFF_MARKER_END, contentStart);
		if (end < 0) continue;
		try {
			const evidence = grillKickoffEvidenceSchema.safeParse(
				JSON.parse(text.slice(contentStart, end)),
			);
			if (evidence.success) return { index, evidence: evidence.data };
		} catch {
			// A malformed marker is ignored so an earlier valid kickoff remains the namespace owner.
		}
	}
	return undefined;
}

function resultSnapshot(entry: unknown): GrillRoundResultEvidence | "malformed" | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "toolResult") return undefined;
	if (message.toolName !== GRILL_ASK_ROUND_TOOL_NAME) return undefined;
	const parsed = grillRoundResultEvidenceSchema.safeParse(message.details);
	return parsed.success ? parsed.data : "malformed";
}

function statusFromResult(action: GrillRoundResultEvidence["action"]): GrillAttemptStatus {
	switch (action) {
		case "invalid-tool-input":
			return "active";
		case "confirmed":
			return "confirmed";
		case "return-to-grilling":
		case "submitted":
			return "active";
		case "ended":
			return "ended";
		case "cancelled":
			return "cancelled";
		case "ui-failed":
			return "ui-failed";
		case "cap-exhausted":
			return "cap-exhausted";
	}
}

function isTerminalStatus(status: GrillAttemptStatus): boolean {
	return (
		status === "confirmed" ||
		status === "ended" ||
		status === "cancelled" ||
		status === "ui-failed" ||
		status === "cap-exhausted" ||
		status === "invalid"
	);
}

function emptyEvaluation(status: GrillAttemptStatus): GrillAttemptEvaluation {
	return {
		status,
		submittedRoundCount: 0,
		answeredDecisionCount: 0,
		submittedRoundIds: new Set(),
		submittedQuestionIds: new Set(),
		hasDuplicateIds: false,
		authorized: false,
	};
}

function userMessageText(entry: unknown): string | undefined {
	const message = messageFromEntry(entry);
	if (!isRecord(message) || message.role !== "user") return undefined;
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return undefined;
	return message.content
		.filter(
			(item): item is { type: "text"; text: string } =>
				isRecord(item) && item.type === "text" && typeof item.text === "string",
		)
		.map((item) => item.text)
		.join("\n");
}

function messageFromEntry(entry: unknown): unknown {
	if (!isRecord(entry) || entry.type !== "message") return undefined;
	return entry.message;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrow host contract for reading and replacing the active model-visible tool set. */
export interface GrillAskActiveToolsHost {
	getActiveTools(): string[];
	setActiveTools(names: string[]): void;
}

/**
 * Idempotently add `grill_ask` to the host's active tool set, preserving every
 * currently active tool and their order. No-op when already active.
 */
export function activateGrillAskTool(host: GrillAskActiveToolsHost): void {
	const active = host.getActiveTools();
	if (active.includes(GRILL_ASK_TOOL_NAME)) return;
	host.setActiveTools([...active, GRILL_ASK_TOOL_NAME]);
}

/**
 * Idempotently remove only `grill_ask` from the host's active tool set,
 * preserving every other active tool. No-op when already inactive.
 */
export function deactivateGrillAskTool(host: GrillAskActiveToolsHost): void {
	const active = host.getActiveTools();
	if (!active.includes(GRILL_ASK_TOOL_NAME)) return;
	host.setActiveTools(active.filter((name) => name !== GRILL_ASK_TOOL_NAME));
}
