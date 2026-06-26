import { z } from "zod";

import { parseGraphqlErrors, parseJsonUnknown } from "./github-graphql-json.ts";
import { isRecord } from "./primitives.ts";

export interface GithubPrIdentity {
	owner: string;
	repo: string;
	number: number;
}

export interface GithubRepositoryIdentity {
	owner: string;
	repo: string;
}

export interface GithubReviewThreadCounts {
	unresolved: number;
	total: number;
	hasMore: boolean;
}

export type GithubCheckBucket = "passing" | "pending" | "failing" | "unknown";

export interface GithubCheckTally {
	passing: number;
	pending: number;
	failing: number;
	unknown: number;
	hasMore?: boolean | undefined;
}

export type GithubStatusCheckKind = "check_run" | "status_context" | "unknown";

export interface GithubStatusCheckEntry {
	readonly bucket: GithubCheckBucket;
	readonly kind: GithubStatusCheckKind;
	readonly name: string;
	readonly workflowName: string | null;
	readonly status: string | null;
	readonly conclusion: string | null;
	readonly state: string | null;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly createdAt: string | null;
	readonly detailsUrl: string | null;
	readonly targetUrl: string | null;
	readonly identity: string | null;
}

export interface GithubStatusChecks {
	readonly counts: GithubCheckTally;
	readonly checks: readonly GithubStatusCheckEntry[];
}

export interface GithubWorktreePrStatusArgs {
	owner: string;
	repo: string;
	headRefName: string;
}

export interface GithubWorktreePrStatus {
	number: number;
	url?: string | undefined;
	headRefName: string;
	headRefOid: string;
	threads: GithubReviewThreadCounts;
	checks: GithubCheckTally;
}

export type GithubWorktreePrStatusParseResult =
	| { type: "ok"; prs: GithubWorktreePrStatus[] }
	| { type: "invalid-json"; kind: "github-unicorn-html" | "html" | "non-json" }
	| { type: "graphql-errors"; messages: readonly string[] }
	| { type: "schema-mismatch" };

export const githubWorktreePrStatusQuery =
	"query($owner:String!,$repo:String!,$headRefName:String!){repository(owner:$owner,name:$repo){pullRequests(first:2,states:OPEN,headRefName:$headRefName,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number url headRefName headRefOid statusCheckRollup{contexts(first:100){pageInfo{hasNextPage} nodes{__typename ... on CheckRun{name status conclusion startedAt completedAt detailsUrl checkSuite{workflowRun{databaseId runNumber runAttempt createdAt updatedAt workflow{name}}}} ... on StatusContext{context state createdAt targetUrl}}}} reviewThreads(first:100){totalCount pageInfo{hasNextPage} nodes{isResolved}}}}}}";

const githubReviewThreadConnectionSchema = z
	.object({
		totalCount: z.number().int().nonnegative().optional(),
		pageInfo: z
			.object({ hasNextPage: z.boolean().default(false) })
			.loose()
			.default({ hasNextPage: false }),
		nodes: z.array(z.object({ isResolved: z.boolean() }).loose()).default([]),
	})
	.loose();

const githubWorktreePrStatusResponseSchema = z
	.object({
		data: z.object({
			repository: z.object({
				pullRequests: z.object({
					nodes: z
						.array(
							z
								.object({
									number: z.number().int().positive(),
									url: z.string().optional(),
									headRefName: z.string(),
									headRefOid: z.string(),
									statusCheckRollup: z
										.object({
											contexts: z
												.object({
													pageInfo: z
														.object({ hasNextPage: z.boolean().default(false) })
														.loose()
														.default({ hasNextPage: false }),
													nodes: z.array(z.unknown()).default([]),
												})
												.loose()
												.nullish(),
										})
										.loose()
										.nullish(),
									reviewThreads: githubReviewThreadConnectionSchema,
								})
								.loose(),
						)
						.default([]),
				}),
			}),
		}),
	})
	.loose();

const PASSING_CHECK_RUN_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILING_CHECK_RUN_CONCLUSIONS = new Set([
	"ACTION_REQUIRED",
	"CANCELLED",
	"FAILURE",
	"STARTUP_FAILURE",
	"STALE",
	"TIMED_OUT",
]);
const PENDING_CHECK_RUN_STATUSES = new Set([
	"QUEUED",
	"IN_PROGRESS",
	"WAITING",
	"REQUESTED",
	"PENDING",
]);
const FAILING_STATUS_CONTEXT_STATES = new Set(["ERROR", "FAILURE"]);

export function githubWorktreePrStatusArgs(identity: GithubWorktreePrStatusArgs): string[] {
	return [
		"api",
		"graphql",
		"-f",
		`query=${githubWorktreePrStatusQuery}`,
		"-f",
		`owner=${identity.owner}`,
		"-f",
		`repo=${identity.repo}`,
		"-f",
		`headRefName=${identity.headRefName}`,
	];
}

export function githubPrIdentityFromUrl(
	url: string,
	expectedNumber?: number,
): GithubPrIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 4 || parts[2] !== "pull") return undefined;
	const number = Number(parts[3]);
	if (!Number.isInteger(number) || number <= 0) return undefined;
	if (expectedNumber !== undefined && number !== expectedNumber) return undefined;
	const [owner, repo] = parts;
	if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0)
		return undefined;
	return { owner, repo, number };
}

export function normalizeGitRemoteUrl(rawUrl: string): string {
	const trimmed = rawUrl.trim();
	if (trimmed.length === 0) return "";

	const scpLike = parseScpLikeRemote(trimmed);
	const candidate = scpLike ?? trimmed;
	const normalizedUrl = normalizeAsUrl(candidate);
	if (normalizedUrl !== undefined) return normalizedUrl;

	return stripGitSuffix(stripTrailingSlashes(candidate));
}

export function githubRepositoryIdentityFromNormalizedRemoteUrl(
	normalizedUrl: string,
): GithubRepositoryIdentity | undefined {
	let parsed: URL;
	try {
		parsed = new URL(normalizedUrl);
	} catch {
		return undefined;
	}
	if (parsed.hostname !== "github.com") return undefined;
	const parts = parsed.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length !== 2) return undefined;
	return repositoryIdentityFromParts(parts[0], parts[1]);
}

export function githubRepositoryIdentityFromRemoteUrl(
	url: string,
): GithubRepositoryIdentity | undefined {
	const normalized = normalizeGitRemoteUrl(url);
	return githubRepositoryIdentityFromNormalizedRemoteUrl(normalized);
}

export function parseGithubWorktreePrStatusJson(
	stdout: string,
): GithubWorktreePrStatus[] | undefined {
	const result = parseGithubWorktreePrStatusJsonResult(stdout);
	return result.type === "ok" ? result.prs : undefined;
}

export function parseGithubWorktreePrStatusJsonResult(
	stdout: string,
): GithubWorktreePrStatusParseResult {
	const parsed = parseJsonUnknown(stdout);
	if (parsed.type === "error") return { type: "invalid-json", kind: classifyInvalidJson(stdout) };

	const graphqlErrors = parseGraphqlErrors(parsed.value);
	if (
		graphqlErrors.type === "ok" &&
		graphqlErrors.errors !== undefined &&
		graphqlErrors.errors.length > 0
	) {
		return { type: "graphql-errors", messages: graphqlErrorMessages(graphqlErrors.errors) };
	}

	const result = githubWorktreePrStatusResponseSchema.safeParse(parsed.value);
	if (!result.success) return { type: "schema-mismatch" };
	return { type: "ok", prs: githubWorktreePrStatusesFromResponse(result.data) };
}

export function classifyGithubStatusCheck(value: unknown): GithubCheckBucket {
	const parsed = z.object({ __typename: z.string() }).loose().safeParse(value);
	if (!parsed.success) return "unknown";
	if (parsed.data.__typename === "CheckRun") return classifyCheckRun(parsed.data);
	if (parsed.data.__typename === "StatusContext") return classifyStatusContext(parsed.data);
	return "unknown";
}

export function tallyGithubStatusChecks(
	items: readonly unknown[],
	options: { hasMore?: boolean | undefined } = {},
): GithubCheckTally {
	return normalizeGithubStatusChecks(items, options).counts;
}

export function normalizeGithubStatusChecks(
	items: readonly unknown[],
	options: { hasMore?: boolean | undefined } = {},
): GithubStatusChecks {
	const checks = latestGithubStatusChecks(items).map(normalizeGithubStatusCheck);
	const counts: GithubCheckTally = { passing: 0, pending: 0, failing: 0, unknown: 0 };
	for (const check of checks) counts[check.bucket] += 1;
	if (options.hasMore === true) counts.hasMore = true;
	return { counts, checks };
}

function normalizeGithubStatusCheck(item: unknown): GithubStatusCheckEntry {
	if (!isRecord(item)) return unknownStatusCheckEntry(item);
	const typename = nonEmptyString(item.__typename);
	const bucket = classifyGithubStatusCheck(item);
	const identity = statusCheckIdentity(item) ?? null;
	if (typename === "CheckRun") {
		const name = nonEmptyString(item.name) ?? "Unknown check";
		return {
			bucket,
			kind: "check_run",
			name,
			workflowName: checkRunWorkflowName(item) ?? null,
			status: nonEmptyString(item.status) ?? null,
			conclusion: nonEmptyString(item.conclusion) ?? null,
			state: null,
			startedAt: nonEmptyString(item.startedAt) ?? null,
			completedAt: nonEmptyString(item.completedAt) ?? null,
			createdAt: null,
			detailsUrl: nonEmptyString(item.detailsUrl) ?? null,
			targetUrl: null,
			identity,
		};
	}
	if (typename === "StatusContext") {
		const name = nonEmptyString(item.context) ?? "Unknown status context";
		return {
			bucket,
			kind: "status_context",
			name,
			workflowName: null,
			status: null,
			conclusion: null,
			state: nonEmptyString(item.state) ?? null,
			startedAt: null,
			completedAt: null,
			createdAt: nonEmptyString(item.createdAt) ?? null,
			detailsUrl: null,
			targetUrl: nonEmptyString(item.targetUrl) ?? null,
			identity,
		};
	}
	return unknownStatusCheckEntry(item);
}

function unknownStatusCheckEntry(item: unknown): GithubStatusCheckEntry {
	const identity = statusCheckIdentity(item) ?? null;
	return {
		bucket: "unknown",
		kind: "unknown",
		name: "Unknown check",
		workflowName: null,
		status: null,
		conclusion: null,
		state: null,
		startedAt: null,
		completedAt: null,
		createdAt: null,
		detailsUrl: null,
		targetUrl: null,
		identity,
	};
}

function latestGithubStatusChecks(items: readonly unknown[]): readonly unknown[] {
	const latestByIdentity = new Map<string, { item: unknown; timestampMs: number | undefined }>();
	const unknownIdentityItems: unknown[] = [];

	for (const item of ignoreSupersededWorkflowRunChecks(items)) {
		const identity = statusCheckIdentity(item);
		if (identity === undefined) {
			unknownIdentityItems.push(item);
			continue;
		}

		const timestampMs = statusCheckTimestampMs(item);
		const current = latestByIdentity.get(identity);
		if (current === undefined || shouldReplaceStatusCheck(current.timestampMs, timestampMs)) {
			latestByIdentity.set(identity, { item, timestampMs });
		}
	}

	return [...latestByIdentity.values()].map((entry) => entry.item).concat(unknownIdentityItems);
}

interface WorkflowRunFacts {
	readonly workflowKey: string;
	readonly runKey: string;
	readonly runNumber: number | undefined;
	readonly runAttempt: number | undefined;
	readonly databaseId: number | undefined;
	readonly timestampMs: number | undefined;
	readonly itemIndex: number;
}

function ignoreSupersededWorkflowRunChecks(items: readonly unknown[]): readonly unknown[] {
	// Workflow-run filtering happens before per-check dedupe because a rerun can change
	// the job matrix names while still superseding every job from the older run.
	const entries = items.map((item, itemIndex) => ({
		item,
		run: workflowRunFactsFromCheckRun(item, itemIndex),
	}));
	const latestByWorkflow = new Map<string, WorkflowRunFacts>();

	for (const entry of entries) {
		if (entry.run === undefined) continue;
		const current = latestByWorkflow.get(entry.run.workflowKey);
		if (current === undefined || shouldReplaceWorkflowRun(current, entry.run)) {
			latestByWorkflow.set(entry.run.workflowKey, entry.run);
		}
	}

	return entries
		.filter((entry) => {
			if (entry.run === undefined) return true;
			return latestByWorkflow.get(entry.run.workflowKey)?.runKey === entry.run.runKey;
		})
		.map((entry) => entry.item);
}

function workflowRunFactsFromCheckRun(
	item: unknown,
	itemIndex: number,
): WorkflowRunFacts | undefined {
	if (!isRecord(item)) return undefined;
	if (nonEmptyString(item.__typename) !== "CheckRun") return undefined;

	const workflowName = checkRunWorkflowName(item);
	const workflowRun = checkRunWorkflowRun(item);
	if (workflowName === undefined || workflowRun === undefined) return undefined;

	const runKey = workflowRunKey(workflowRun, workflowName);
	if (runKey === undefined) return undefined;

	return {
		workflowKey: `workflow:${workflowName}`,
		runKey,
		runNumber: numericValue(workflowRun.runNumber),
		runAttempt: numericValue(workflowRun.runAttempt),
		databaseId: numericValue(workflowRun.databaseId),
		timestampMs:
			dateTimestampMs(workflowRun.updatedAt) ??
			dateTimestampMs(workflowRun.createdAt) ??
			statusCheckTimestampMs(item),
		itemIndex,
	};
}

function checkRunWorkflowRun(item: Record<string, unknown>): Record<string, unknown> | undefined {
	const checkSuite = item.checkSuite;
	if (!isRecord(checkSuite)) return undefined;
	const workflowRun = checkSuite.workflowRun;
	return isRecord(workflowRun) ? workflowRun : undefined;
}

function workflowRunKey(
	workflowRun: Record<string, unknown>,
	workflowName: string,
): string | undefined {
	const id = nonEmptyString(workflowRun.id);
	if (id !== undefined) return `workflow-run-id:${id}`;

	const databaseId = numericValue(workflowRun.databaseId);
	if (databaseId !== undefined) return `workflow-run-database-id:${databaseId}`;

	const runNumber = numericValue(workflowRun.runNumber);
	if (runNumber !== undefined) {
		return `workflow-run-number:${workflowName}:${runNumber}:${numericValue(workflowRun.runAttempt) ?? 0}`;
	}

	const timestampMs =
		dateTimestampMs(workflowRun.updatedAt) ?? dateTimestampMs(workflowRun.createdAt);
	return timestampMs === undefined
		? undefined
		: `workflow-run-timestamp:${workflowName}:${timestampMs}`;
}

function shouldReplaceWorkflowRun(current: WorkflowRunFacts, candidate: WorkflowRunFacts): boolean {
	if (
		current.runNumber !== undefined &&
		candidate.runNumber !== undefined &&
		current.runNumber !== candidate.runNumber
	) {
		return candidate.runNumber > current.runNumber;
	}

	if (
		current.runAttempt !== undefined &&
		candidate.runAttempt !== undefined &&
		current.runAttempt !== candidate.runAttempt
	) {
		return candidate.runAttempt > current.runAttempt;
	}

	if (
		current.timestampMs !== undefined &&
		candidate.timestampMs !== undefined &&
		current.timestampMs !== candidate.timestampMs
	) {
		return candidate.timestampMs > current.timestampMs;
	}

	if (
		current.databaseId !== undefined &&
		candidate.databaseId !== undefined &&
		current.databaseId !== candidate.databaseId
	) {
		return candidate.databaseId > current.databaseId;
	}

	return candidate.itemIndex > current.itemIndex;
}

function numericValue(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string" || value.trim().length === 0) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function shouldReplaceStatusCheck(
	currentTimestampMs: number | undefined,
	candidateTimestampMs: number | undefined,
): boolean {
	if (candidateTimestampMs === undefined) return currentTimestampMs === undefined;
	if (currentTimestampMs === undefined) return true;
	return candidateTimestampMs >= currentTimestampMs;
}

function statusCheckIdentity(item: unknown): string | undefined {
	if (!isRecord(item)) return undefined;
	const typename = nonEmptyString(item.__typename);
	if (typename === "CheckRun") return checkRunIdentity(item);
	if (typename === "StatusContext") return statusContextIdentity(item);
	return undefined;
}

function checkRunIdentity(item: Record<string, unknown>): string | undefined {
	const name = nonEmptyString(item.name);
	const workflowName = checkRunWorkflowName(item);
	if (workflowName !== undefined && name !== undefined) return `check-run:${workflowName}:${name}`;
	if (name !== undefined) return `check-run:${name}`;
	const detailsUrl = nonEmptyString(item.detailsUrl);
	return detailsUrl === undefined ? undefined : `check-run-url:${detailsUrl}`;
}

function checkRunWorkflowName(item: Record<string, unknown>): string | undefined {
	const directWorkflowName = nonEmptyString(item.workflowName);
	if (directWorkflowName !== undefined) return directWorkflowName;

	const checkSuite = item.checkSuite;
	if (!isRecord(checkSuite)) return undefined;
	const workflowRun = checkSuite.workflowRun;
	if (!isRecord(workflowRun)) return undefined;
	const workflow = workflowRun.workflow;
	if (!isRecord(workflow)) return undefined;
	return nonEmptyString(workflow.name);
}

function statusContextIdentity(item: Record<string, unknown>): string | undefined {
	const context = nonEmptyString(item.context);
	if (context !== undefined) return `status-context:${context}`;
	const targetUrl = nonEmptyString(item.targetUrl);
	return targetUrl === undefined ? undefined : `status-context-url:${targetUrl}`;
}

function statusCheckTimestampMs(item: unknown): number | undefined {
	if (!isRecord(item)) return undefined;
	return (
		dateTimestampMs(item.completedAt) ??
		dateTimestampMs(item.startedAt) ??
		dateTimestampMs(item.createdAt)
	);
}

function dateTimestampMs(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const timestampMs = Date.parse(value);
	return Number.isNaN(timestampMs) ? undefined : timestampMs;
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function repositoryIdentityFromParts(
	owner: string | undefined,
	repoWithSuffix: string | undefined,
): GithubRepositoryIdentity | undefined {
	if (
		owner === undefined ||
		repoWithSuffix === undefined ||
		owner.length === 0 ||
		repoWithSuffix.length === 0
	)
		return undefined;
	const repo = stripGitSuffix(repoWithSuffix);
	if (repo.length === 0 || repo.includes("/")) return undefined;
	return { owner, repo };
}

function normalizeAsUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}

	const protocol = url.protocol.toLowerCase();
	const host = url.hostname.toLowerCase();
	const username = url.username ? `${url.username}@` : "";
	const port = url.port ? `:${url.port}` : "";
	const path = stripGitSuffix(stripTrailingSlashes(url.pathname.replace(/^\/+/, "")));
	if (path.length === 0) return `${protocol}//${username}${host}${port}`;
	return `${protocol}//${username}${host}${port}/${path}`;
}

function parseScpLikeRemote(value: string): string | undefined {
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return undefined;

	const match = /^(?<user>[^@/:]+@)?(?<host>[^:/]+):(?<path>.+)$/.exec(value);
	if (!match?.groups) return undefined;

	const user = match.groups.user ?? "";
	return `ssh://${user}${match.groups.host}/${match.groups.path}`;
}

function stripTrailingSlashes(value: string): string {
	return value.replace(/\/+$/g, "");
}

function stripGitSuffix(value: string): string {
	return value.replace(/\.git$/i, "");
}

function reviewThreadCountsFromConnection(
	connection: z.infer<typeof githubReviewThreadConnectionSchema>,
): GithubReviewThreadCounts {
	const hasMore = connection.pageInfo.hasNextPage;
	const totalCount = connection.totalCount ?? connection.nodes.length;
	return {
		unresolved: connection.nodes.filter((node) => !node.isResolved).length,
		total: hasMore ? connection.nodes.length : totalCount,
		hasMore,
	};
}

function githubWorktreePrStatusesFromResponse(
	response: z.infer<typeof githubWorktreePrStatusResponseSchema>,
): GithubWorktreePrStatus[] {
	return response.data.repository.pullRequests.nodes.map((node) => {
		const contexts = node.statusCheckRollup?.contexts;
		return {
			number: node.number,
			url: node.url,
			headRefName: node.headRefName,
			headRefOid: node.headRefOid,
			threads: reviewThreadCountsFromConnection(node.reviewThreads),
			checks: tallyGithubStatusChecks(contexts?.nodes ?? [], {
				hasMore: contexts?.pageInfo.hasNextPage ?? false,
			}),
		};
	});
}

function classifyInvalidJson(stdout: string): "github-unicorn-html" | "html" | "non-json" {
	const trimmed = stdout.trim();
	if (looksLikeHtml(trimmed)) {
		if (/Unicorn!/i.test(trimmed) && /GitHub/i.test(trimmed)) return "github-unicorn-html";
		return "html";
	}
	return "non-json";
}

function looksLikeHtml(value: string): boolean {
	return /^<(?:!doctype\s+html\b|html\b|head\b|body\b)/i.test(value);
}

function graphqlErrorMessages(errors: readonly unknown[]): readonly string[] {
	const messages = errors.flatMap((error) => {
		if (!isRecord(error)) return [];
		const message = error.message;
		if (typeof message !== "string") return [];
		const trimmed = message.trim();
		return trimmed.length > 0 ? [trimmed] : [];
	});
	return messages.length > 0 ? messages : ["GitHub returned GraphQL errors without messages"];
}

function classifyCheckRun(value: Record<string, unknown>): GithubCheckBucket {
	const status = typeof value.status === "string" ? value.status : undefined;
	if (status === undefined) return "unknown";
	if (status !== "COMPLETED") return PENDING_CHECK_RUN_STATUSES.has(status) ? "pending" : "unknown";

	const conclusion = typeof value.conclusion === "string" ? value.conclusion : undefined;
	if (conclusion === undefined) return "unknown";
	if (PASSING_CHECK_RUN_CONCLUSIONS.has(conclusion)) return "passing";
	if (FAILING_CHECK_RUN_CONCLUSIONS.has(conclusion)) return "failing";
	return "unknown";
}

function classifyStatusContext(value: Record<string, unknown>): GithubCheckBucket {
	const state = typeof value.state === "string" ? value.state : undefined;
	if (state === "SUCCESS") return "passing";
	if (state === "PENDING" || state === "EXPECTED") return "pending";
	if (state !== undefined && FAILING_STATUS_CONTEXT_STATES.has(state)) return "failing";
	return "unknown";
}
