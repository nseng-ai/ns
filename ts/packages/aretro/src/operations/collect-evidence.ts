import { failure, negative, ok, usageError } from "@sdl/clinkr";
import { z } from "zod";

import type { AretroCliContext } from "../context.ts";
import type { BranchSource } from "../contracts.ts";
import {
	collectEvidenceResultSchema,
	type CollectEvidenceResult,
	type CollectEvidenceError,
	type RepoContextDto,
	type SessionQueryDto,
	type SessionSourceInfoDto,
	type SessionSourceRefDto,
	type SessionWarningDto,
	type SessionAssociationDto,
	type MessageCountsDto,
	type SessionSummaryDto,
	type AggregateMetricsDto,
	type EvidenceItemDto,
	type PayloadReference,
	type OutputBoundsDto,
	type SessionResultBoundsDto,
} from "../contracts.ts";
import type {
	ParsedSession,
	SessionQuery,
	SessionQueryResult,
	SessionSourceInfo,
	SessionSourceRef,
	SessionWarning,
	SessionAssociation,
	SessionMessageCounts,
} from "../sessions/types.ts";
import { collectSessionEvidence } from "../sessions/evidence.ts";
import { PayloadError } from "../payloads/errors.ts";
import { buildEvidencePayloadData } from "../payloads/evidence-payload.ts";
import { PayloadStore } from "../payloads/store.ts";

export const collectEvidenceRequestSchema = z.object({
	repo: z.string().optional(),
	branch: z.string().optional(),
	sessionRoot: z.string().optional(),
	maxSessions: z.number().default(20),
	payloadMode: z.enum(["inline", "payload"]).default("inline"),
	payloadSessionId: z.string().optional(),
});

export type CollectEvidenceRequest = z.infer<typeof collectEvidenceRequestSchema>;

export { collectEvidenceResultSchema };
export type { CollectEvidenceResult };

export async function runCollectEvidence(
	context: AretroCliContext,
	request: CollectEvidenceRequest,
) {
	if (request.payloadMode === "payload") {
		let payloadStore: PayloadStore;
		try {
			payloadStore = PayloadStore.fromEnvironment({
				...(request.payloadSessionId !== undefined && {
					explicitSessionId: request.payloadSessionId,
				}),
				...(context.env !== undefined && { env: context.env }),
			});
		} catch (error) {
			const payloadError = error instanceof PayloadError ? error : null;
			const collectError: CollectEvidenceError = {
				code: payloadError?.errorType ?? "payload-mode-failed",
				message: payloadError?.message ?? String(error),
			};
			return collectFailure(context, request, {
				repoRoot: null,
				branch: request.branch ?? null,
				branchSource: branchSourceForUnresolvedRepo(request),
				error: collectError,
				warnings: [],
			});
		}

		const resolved = await resolveRepoAndQuery(context, request);
		if (!resolved.ok) return resolved.negative;

		const payloadData = buildEvidencePayloadData({
			compactResult: resolved.compactResult,
			sessions: resolved.publicQueryResult.sessions,
		});

		let payloadReference: PayloadReference;
		try {
			payloadReference = payloadStore.writeJsonArtifact({
				descriptor: "aretro-collect-evidence",
				role: "raw",
				payload: { status: "ok", exitCode: 0, data: payloadData },
			});
		} catch (error) {
			const payloadError = error instanceof PayloadError ? error : null;
			const collectError: CollectEvidenceError = {
				code: payloadError?.errorType ?? "payload-write-failed",
				message: payloadError?.message ?? String(error),
			};
			return collectFailure(context, request, {
				repoRoot: resolved.repo.repoRoot,
				branch: resolved.resolvedBranch.branch,
				branchSource: resolved.resolvedBranch.branchSource,
				error: collectError,
				warnings: resolved.compactResult.warnings,
			});
		}

		const payloadResult: CollectEvidenceResult = {
			...resolved.compactResult,
			outputBounds: withPayloadDetailBounds(resolved.compactResult.outputBounds),
			payloadMode: "payload",
			payloadReference: payloadReference,
			detailLocatorHints: [...DETAIL_LOCATOR_HINTS],
		};
		return ok(payloadResult);
	}

	const resolved = await resolveRepoAndQuery(context, request);
	if (!resolved.ok) return resolved.negative;
	return ok(resolved.compactResult);
}

const DETAIL_LOCATOR_HINTS = [
	"/data/repo",
	"/data/query",
	"/data/source",
	"/data/aggregateMetrics",
	"/data/sessions/0",
	"/data/sessions/0/toolCalls",
	"/data/evidenceItems/0/supportingEventPointers",
] as const;

export function renderCollectEvidence(_result: CollectEvidenceResult): string {
	const branch = _result.repo.branch ?? "<unresolved>";
	const sessionCount = _result.aggregateMetrics.sessionCount;
	const harness = _result.source.harness;
	const adapterName = _result.source.adapterName;
	const warningCount = _result.aggregateMetrics.warningCount;
	const truncationLine = _result.outputBounds.sessions.hasMore
		? "More sessions available; increase --max-sessions or narrow the query.\n"
		: "";
	return (
		`Collected ${sessionCount} session(s) from ${harness}/${adapterName} for branch ${branch}.\n` +
		truncationLine +
		`Warnings: ${warningCount}\n` +
		`Run with --format json for the skill-facing evidence envelope.`
	);
}

function overfetchLimit(maxSessions: number): number {
	return Math.max(0, maxSessions) + 1;
}

function publicQueryResultFromOverfetch(
	queryResult: SessionQueryResult,
	requestedMaxSessions: number,
): SessionQueryResult {
	const publicSessionCount = Math.max(0, requestedMaxSessions);
	const sessions = queryResult.sessions.slice(0, publicSessionCount);
	const sentinelSessions = queryResult.sessions.slice(publicSessionCount);
	return {
		source_info: queryResult.source_info,
		sessions,
		warnings: warningsWithoutSentinel(queryResult.warnings, sentinelSessions),
	};
}

function warningsWithoutSentinel(
	warnings: readonly SessionWarning[],
	sentinelSessions: readonly ParsedSession[],
): readonly SessionWarning[] {
	if (sentinelSessions.length === 0) return warnings;
	const sentinelWarningKeys = new Set(
		sentinelSessions.flatMap((session) => session.warnings.map((warning) => warningKey(warning))),
	);
	return warnings.filter((warning) => !sentinelWarningKeys.has(warningKey(warning)));
}

function warningKey(warning: SessionWarning): string {
	return JSON.stringify({
		code: warning.code,
		message: warning.message,
		sourceRef: warning.source_ref,
		harness: warning.harness,
		adapterName: warning.adapter_name,
	});
}

function sessionBoundsFromOverfetch(
	request: CollectEvidenceRequest,
	queryResult: SessionQueryResult,
	publicQueryResult: SessionQueryResult,
): SessionResultBoundsDto {
	const hasMore = queryResult.sessions.length > publicQueryResult.sessions.length;
	return {
		appliedLimit: request.maxSessions,
		returnedCount: publicQueryResult.sessions.length,
		isComplete: !hasMore,
		hasMore,
		continuation: hasMore
			? {
					kind: request.sessionRoot === undefined ? "narrow-session-root" : "increase-max-sessions",
					message:
						"More sessions are available. Increase --max-sessions or narrow with --session-root, --branch, or --repo.",
				}
			: null,
	};
}

function inlineDetailBounds(): OutputBoundsDto["detail"] {
	return {
		mode: "inline",
		guidance:
			"Inline results contain compact summaries only. Rerun with --payload-mode payload --payload-session-id <id> to write raw detail for read-evidence-detail.",
		locatorHints: [],
	};
}

function withPayloadDetailBounds(outputBounds: OutputBoundsDto): OutputBoundsDto {
	return {
		...outputBounds,
		detail: {
			mode: "payload",
			guidance:
				"Use sdl aretro exec read-evidence-detail --payload-path <path> --json-pointer <pointer> with the narrowest useful /data/... pointer.",
			locatorHints: [...DETAIL_LOCATOR_HINTS],
		},
	};
}

async function resolveRepoAndQuery(context: AretroCliContext, request: CollectEvidenceRequest) {
	const cwd = context.cwd;
	const repoInput = request.repo ?? cwd;
	function preResolutionFailure(error: CollectEvidenceError) {
		return {
			ok: false as const,
			negative: collectFailure(context, request, {
				repoRoot: null,
				branch: request.branch ?? null,
				branchSource: branchSourceForUnresolvedRepo(request),
				error,
				warnings: [],
			}),
		};
	}

	const repoRootResult = await context.git.optionalRepoRoot({ cwd: repoInput });
	if (repoRootResult.type === "missing") {
		const error: CollectEvidenceError = {
			code: "not-a-git-repo",
			message: `Not a git repository: ${repoInput}. Pass --repo with a git repository path.`,
		};
		return preResolutionFailure(error);
	}
	if (repoRootResult.type === "error") {
		const error: CollectEvidenceError = {
			code: repoRootResult.error.code,
			message: repoRootResult.error.message,
		};
		return preResolutionFailure(error);
	}
	const repoRoot = repoRootResult.value;

	const resolvedBranch = await resolveBranch(context, repoRoot, request.branch);
	if (resolvedBranch.error !== null) {
		return {
			ok: false as const,
			negative: collectFailure(context, request, {
				repoRoot,
				branch: resolvedBranch.branch,
				branchSource: resolvedBranch.branchSource,
				error: resolvedBranch.error,
				warnings: [],
			}),
		};
	}

	const repo: RepoContextDto = {
		repoRoot: repoRoot,
		cwd,
		branch: resolvedBranch.branch,
		branchSource: resolvedBranch.branchSource,
	};

	const query: SessionQuery = {
		repo_root: repoRoot,
		session_root: request.sessionRoot ?? null,
		max_sessions: overfetchLimit(request.maxSessions),
	};

	const queryResult = await context.sessionSource.query(query);
	const publicQueryResult = publicQueryResultFromOverfetch(queryResult, request.maxSessions);
	const sessionBounds = sessionBoundsFromOverfetch(request, queryResult, publicQueryResult);
	const compactResult = resultFromQueryResult(request, repo, publicQueryResult, sessionBounds);

	return {
		ok: true as const,
		repo,
		resolvedBranch,
		queryResult,
		publicQueryResult,
		compactResult,
	};
}

function collectFailure(
	context: AretroCliContext,
	request: CollectEvidenceRequest,
	options: {
		repoRoot: string | null;
		branch: string | null;
		branchSource: BranchSource;
		error: CollectEvidenceError;
		warnings: readonly SessionWarningDto[];
	},
) {
	const result = emptyResult({
		request,
		cwd: context.cwd,
		repoRoot: options.repoRoot,
		branch: options.branch,
		branchSource: options.branchSource,
		sourceInfo: context.sessionSource.sourceInfo,
		error: options.error,
		warnings: [...options.warnings],
	});
	const exitKind = classifyCollectEvidenceError(options.error.code);
	if (exitKind === "usageError") return usageError(options.error.message, result);
	if (exitKind === "failure") return failure(options.error.code, options.error.message, result);
	return negative(options.error.message, { data: result });
}

function classifyCollectEvidenceError(code: string): "usageError" | "failure" | "negative" {
	switch (code) {
		case "not-a-git-repo":
		case "detached-head":
			return "usageError";
		default:
			return "failure";
	}
}

interface ResolvedBranch {
	branch: string | null;
	branchSource: BranchSource;
	error: CollectEvidenceError | null;
}

async function resolveBranch(
	context: AretroCliContext,
	repoRoot: string,
	explicitBranch: string | undefined,
): Promise<ResolvedBranch> {
	if (explicitBranch !== undefined) {
		return { branch: explicitBranch, branchSource: "explicit", error: null };
	}

	const currentBranchResult = await context.git.currentBranch({ cwd: repoRoot });
	if (currentBranchResult.type === "branch") {
		return {
			branch: currentBranchResult.branch,
			branchSource: "git-current-branch",
			error: null,
		};
	}

	if (currentBranchResult.type === "detached") {
		return {
			branch: null,
			branchSource: "detached",
			error: {
				code: "detached-head",
				message: `Detached HEAD at ${repoRoot}; pass --branch to collect evidence.`,
			},
		};
	}

	return {
		branch: null,
		branchSource: "unresolved",
		error: {
			code: currentBranchResult.error.code,
			message: currentBranchResult.error.message,
		},
	};
}

function resultFromQueryResult(
	request: CollectEvidenceRequest,
	repo: RepoContextDto,
	queryResult: SessionQueryResult,
	sessionBounds: SessionResultBoundsDto,
): CollectEvidenceResult {
	const summaries = queryResult.sessions.map((session) => summarizeSession(session));
	const warnings = queryResult.warnings.map((warning) => warningToDto(warning));
	const evidenceItems = collectSessionEvidence(queryResult.sessions).map((item) =>
		evidenceItemToDto(item),
	);

	return {
		success: true,
		error: null,
		repo,
		query: queryToDto(request, repo.repoRoot),
		source: sourceInfoToDto(queryResult.source_info),
		aggregateMetrics: aggregateMetricsFromSummaries(summaries, warnings),
		sessions: summaries,
		warnings,
		evidenceItems: evidenceItems,
		outputBounds: {
			sessions: sessionBounds,
			detail: inlineDetailBounds(),
		},
	};
}

function emptyResult(options: {
	request: CollectEvidenceRequest;
	cwd: string;
	repoRoot: string | null;
	branch: string | null;
	branchSource: BranchSource;
	sourceInfo: SessionSourceInfo;
	error: CollectEvidenceError;
	warnings: SessionWarningDto[];
}): CollectEvidenceResult {
	const repo: RepoContextDto = {
		repoRoot: options.repoRoot,
		cwd: options.cwd,
		branch: options.branch,
		branchSource: options.branchSource,
	};

	return {
		success: false,
		error: options.error,
		repo,
		query: queryToDto(options.request, repo.repoRoot),
		source: sourceInfoToDto(options.sourceInfo),
		aggregateMetrics: aggregateMetricsFromSummaries([], options.warnings),
		sessions: [],
		warnings: options.warnings,
		evidenceItems: [],
		outputBounds: {
			sessions: {
				appliedLimit: options.request.maxSessions,
				returnedCount: 0,
				isComplete: true,
				hasMore: false,
				continuation: null,
			},
			detail: inlineDetailBounds(),
		},
	};
}

export function summarizeSession(session: ParsedSession): SessionSummaryDto {
	return {
		sessionId: session.session_id,
		startedAtIso: session.started_at_iso,
		endedAtIso: session.ended_at_iso,
		sourceRef: sourceRefToDto(session.source_ref),
		association: associationToDto(session.association),
		messageCounts: messageCountsToDto(session.message_counts),
		modelEventCount: session.model_events.length,
		toolCallCount: session.tool_calls.length,
		toolResultCount: session.tool_results.length,
		commandExecutionCount: session.command_executions.length,
		usageEventCount: session.usage_events.length,
		warningCount: session.warnings.length,
	};
}

export function aggregateMetricsFromSummaries(
	summaries: readonly SessionSummaryDto[],
	warnings: readonly SessionWarningDto[],
): AggregateMetricsDto {
	return {
		sessionCount: summaries.length,
		messageCounts: {
			user: summaries.reduce((sum, s) => sum + s.messageCounts.user, 0),
			assistant: summaries.reduce((sum, s) => sum + s.messageCounts.assistant, 0),
			toolResult: summaries.reduce((sum, s) => sum + s.messageCounts.toolResult, 0),
			commandExecution: summaries.reduce((sum, s) => sum + s.messageCounts.commandExecution, 0),
			system: summaries.reduce((sum, s) => sum + s.messageCounts.system, 0),
			other: summaries.reduce((sum, s) => sum + s.messageCounts.other, 0),
		},
		toolCallCount: summaries.reduce((sum, s) => sum + s.toolCallCount, 0),
		toolResultCount: summaries.reduce((sum, s) => sum + s.toolResultCount, 0),
		commandExecutionCount: summaries.reduce((sum, s) => sum + s.commandExecutionCount, 0),
		usageEventCount: summaries.reduce((sum, s) => sum + s.usageEventCount, 0),
		warningCount: warnings.length,
	};
}

function queryToDto(request: CollectEvidenceRequest, repoRoot: string | null): SessionQueryDto {
	return {
		repoRoot: repoRoot,
		sessionRoot: request.sessionRoot ?? null,
		maxSessions: request.maxSessions,
	};
}

function sourceInfoToDto(sourceInfo: SessionSourceInfo): SessionSourceInfoDto {
	return {
		harness: sourceInfo.harness,
		adapterName: sourceInfo.adapter_name,
		recordFormat: sourceInfo.record_format,
	};
}

function sourceRefToDto(sourceRef: SessionSourceRef): SessionSourceRefDto {
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		lineNumber: sourceRef.line_number,
	};
}

function warningToDto(warning: SessionWarning): SessionWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		sourceRef: warning.source_ref !== null ? sourceRefToDto(warning.source_ref) : null,
		harness: warning.harness,
		adapterName: warning.adapter_name,
	};
}

function associationToDto(association: SessionAssociation): SessionAssociationDto {
	return {
		repoRoot: association.repo_root,
		cwd: association.cwd,
		branch: association.branch,
		confidence: association.confidence,
		evidence: [...association.evidence],
	};
}

function messageCountsToDto(counts: SessionMessageCounts): MessageCountsDto {
	return {
		user: counts.user,
		assistant: counts.assistant,
		toolResult: counts.tool_result,
		commandExecution: counts.command_execution,
		system: counts.system,
		other: counts.other,
	};
}

function evidenceItemToDto(item: {
	kind: string;
	subject: string;
	summary: string;
	count: number | null;
	sessionCount: number | null;
	sourceRefs: readonly SessionSourceRef[];
	metadata: Readonly<Record<string, string | number | boolean | null>>;
}): EvidenceItemDto {
	return {
		kind: item.kind,
		subject: item.subject,
		summary: item.summary,
		count: item.count,
		sessionCount: item.sessionCount,
		sourceRefs: item.sourceRefs.map((ref) => sourceRefToDto(ref)),
		metadata: { ...item.metadata },
	};
}

function branchSourceForUnresolvedRepo(request: CollectEvidenceRequest): BranchSource {
	return request.branch !== undefined ? "explicit" : "unresolved";
}
