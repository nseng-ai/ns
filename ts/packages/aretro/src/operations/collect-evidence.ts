import { ok, shellNegative } from "@asdl/clinkr";
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

export const collectEvidenceRequestSchema = z.object({
	repo: z.string().optional(),
	branch: z.string().optional(),
	session_root: z.string().optional(),
	max_sessions: z.number().default(20),
	payload_mode: z.enum(["inline", "payload"]).default("inline"),
	payload_session_id: z.string().optional(),
});

export type CollectEvidenceRequest = z.infer<typeof collectEvidenceRequestSchema>;

export { collectEvidenceResultSchema };
export type { CollectEvidenceResult };

export async function runCollectEvidence(
	context: AretroCliContext,
	request: CollectEvidenceRequest,
) {
	const cwd = context.cwd;
	const repoInput = request.repo ?? cwd;
	const sourceInfo = context.sessionSource.sourceInfo;

	if (request.payload_mode === "payload") {
		const error: CollectEvidenceError = {
			code: "payload_mode_not_implemented",
			message: "Payload mode is not yet implemented in the TypeScript port.",
		};
		return shellNegativeBeforeResolution({ request, cwd, sourceInfo, error });
	}

	const gitCommonDir = await context.git.getGitCommonDir({ cwd: repoInput });
	if (gitCommonDir === null) {
		const error: CollectEvidenceError = {
			code: "not_a_git_repo",
			message: `Not a git repository: ${repoInput}. Pass --repo with a git repository path.`,
		};
		return shellNegativeBeforeResolution({ request, cwd, sourceInfo, error });
	}

	const repoRootResult = await context.git.getRepositoryRoot({ cwd: repoInput });
	if (!repoRootResult.ok) {
		const error: CollectEvidenceError = {
			code: repoRootResult.error.code,
			message: repoRootResult.error.message,
		};
		return shellNegativeBeforeResolution({ request, cwd, sourceInfo, error });
	}
	const repoRoot = repoRootResult.value;

	const resolvedBranch = await resolveBranch(context, repoRoot, request.branch);
	if (resolvedBranch.error !== null) {
		const result = emptyResult({
			request,
			cwd,
			repoRoot,
			branch: resolvedBranch.branch,
			branchSource: resolvedBranch.branchSource,
			sourceInfo,
			error: resolvedBranch.error,
			warnings: [],
		});
		return shellNegative(resolvedBranch.error.message, result);
	}

	const repo: RepoContextDto = {
		repo_root: repoRoot,
		cwd,
		branch: resolvedBranch.branch,
		branch_source: resolvedBranch.branchSource,
	};

	const query: SessionQuery = {
		repo_root: repoRoot,
		session_root: request.session_root ?? null,
		max_sessions: request.max_sessions,
	};

	const queryResult = await context.sessionSource.query(query);
	const compactResult = resultFromQueryResult(request, repo, queryResult);

	return ok(compactResult);
}

export function renderCollectEvidence(_result: CollectEvidenceResult): string {
	const branch = _result.repo.branch ?? "<unresolved>";
	const sessionCount = _result.aggregate_metrics.session_count;
	const harness = _result.source.harness;
	const adapterName = _result.source.adapter_name;
	const warningCount = _result.aggregate_metrics.warning_count;
	return (
		`Collected ${sessionCount} session(s) from ${harness}/${adapterName} for branch ${branch}.\n` +
		`Warnings: ${warningCount}\n` +
		`Run with --format json for the skill-facing evidence envelope.`
	);
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

	const currentBranchResult = await context.git.getCurrentBranch({ cwd: repoRoot });
	if (currentBranchResult.ok) {
		return {
			branch: currentBranchResult.value,
			branchSource: "git_current_branch",
			error: null,
		};
	}

	if (currentBranchResult.error.code === "detached_head") {
		return {
			branch: null,
			branchSource: "detached",
			error: {
				code: "detached_head",
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
		query: queryToDto(request, repo.repo_root),
		source: sourceInfoToDto(queryResult.source_info),
		aggregate_metrics: aggregateMetricsFromSummaries(summaries, warnings),
		sessions: summaries,
		warnings,
		evidence_items: evidenceItems,
	};
}

function shellNegativeBeforeResolution(options: {
	request: CollectEvidenceRequest;
	cwd: string;
	sourceInfo: SessionSourceInfo;
	error: CollectEvidenceError;
}) {
	return shellNegative(
		options.error.message,
		emptyResult({
			request: options.request,
			cwd: options.cwd,
			repoRoot: null,
			branch: options.request.branch ?? null,
			branchSource: branchSourceForUnresolvedRepo(options.request),
			sourceInfo: options.sourceInfo,
			error: options.error,
			warnings: [],
		}),
	);
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
		repo_root: options.repoRoot,
		cwd: options.cwd,
		branch: options.branch,
		branch_source: options.branchSource,
	};

	return {
		success: false,
		error: options.error,
		repo,
		query: queryToDto(options.request, repo.repo_root),
		source: sourceInfoToDto(options.sourceInfo),
		aggregate_metrics: aggregateMetricsFromSummaries([], options.warnings),
		sessions: [],
		warnings: options.warnings,
		evidence_items: [],
	};
}

export function summarizeSession(session: ParsedSession): SessionSummaryDto {
	return {
		session_id: session.session_id,
		started_at_iso: session.started_at_iso,
		ended_at_iso: session.ended_at_iso,
		source_ref: sourceRefToDto(session.source_ref),
		association: associationToDto(session.association),
		message_counts: messageCountsToDto(session.message_counts),
		model_event_count: session.model_events.length,
		tool_call_count: session.tool_calls.length,
		tool_result_count: session.tool_results.length,
		command_execution_count: session.command_executions.length,
		usage_event_count: session.usage_events.length,
		warning_count: session.warnings.length,
	};
}

export function aggregateMetricsFromSummaries(
	summaries: readonly SessionSummaryDto[],
	warnings: readonly SessionWarningDto[],
): AggregateMetricsDto {
	return {
		session_count: summaries.length,
		message_counts: {
			user: summaries.reduce((sum, s) => sum + s.message_counts.user, 0),
			assistant: summaries.reduce((sum, s) => sum + s.message_counts.assistant, 0),
			tool_result: summaries.reduce((sum, s) => sum + s.message_counts.tool_result, 0),
			command_execution: summaries.reduce((sum, s) => sum + s.message_counts.command_execution, 0),
			system: summaries.reduce((sum, s) => sum + s.message_counts.system, 0),
			other: summaries.reduce((sum, s) => sum + s.message_counts.other, 0),
		},
		tool_call_count: summaries.reduce((sum, s) => sum + s.tool_call_count, 0),
		tool_result_count: summaries.reduce((sum, s) => sum + s.tool_result_count, 0),
		command_execution_count: summaries.reduce((sum, s) => sum + s.command_execution_count, 0),
		usage_event_count: summaries.reduce((sum, s) => sum + s.usage_event_count, 0),
		warning_count: warnings.length,
	};
}

function queryToDto(request: CollectEvidenceRequest, repoRoot: string | null): SessionQueryDto {
	return {
		repo_root: repoRoot,
		session_root: request.session_root ?? null,
		max_sessions: request.max_sessions,
	};
}

function sourceInfoToDto(sourceInfo: SessionSourceInfo): SessionSourceInfoDto {
	return {
		harness: sourceInfo.harness,
		adapter_name: sourceInfo.adapter_name,
		record_format: sourceInfo.record_format,
	};
}

function sourceRefToDto(sourceRef: SessionSourceRef): SessionSourceRefDto {
	return {
		path: sourceRef.path,
		uri: sourceRef.uri,
		line_number: sourceRef.line_number,
	};
}

function warningToDto(warning: SessionWarning): SessionWarningDto {
	return {
		code: warning.code,
		message: warning.message,
		source_ref: warning.source_ref !== null ? sourceRefToDto(warning.source_ref) : null,
		harness: warning.harness,
		adapter_name: warning.adapter_name,
	};
}

function associationToDto(association: SessionAssociation): SessionAssociationDto {
	return {
		repo_root: association.repo_root,
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
		tool_result: counts.tool_result,
		command_execution: counts.command_execution,
		system: counts.system,
		other: counts.other,
	};
}

function evidenceItemToDto(item: {
	kind: string;
	subject: string;
	summary: string;
	count: number | null;
	session_count: number | null;
	source_refs: readonly SessionSourceRef[];
	metadata: Readonly<Record<string, string | number | boolean | null>>;
}): EvidenceItemDto {
	return {
		kind: item.kind,
		subject: item.subject,
		summary: item.summary,
		count: item.count,
		session_count: item.session_count,
		source_refs: item.source_refs.map((ref) => sourceRefToDto(ref)),
		metadata: { ...item.metadata },
	};
}

function branchSourceForUnresolvedRepo(request: CollectEvidenceRequest): BranchSource {
	return request.branch !== undefined ? "explicit" : "unresolved";
}
