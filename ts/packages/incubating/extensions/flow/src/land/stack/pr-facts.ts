import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import { exec, formatCommandDetails } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELD_NAMES, PR_FIELDS } from "./constants.ts";
import { landFailure, landingExecutionFailure, landSuccess, type LandResult } from "../results.ts";
import type { PullRequestDependencyFacts, PullRequestFacts } from "../types.ts";
import type { LandExecutionApi } from "./types.ts";

interface GitHubRepositoryName {
	readonly owner: string;
	readonly name: string;
}

type BatchedPullRequestParseResult =
	| { readonly type: "success"; readonly prs: ReadonlyMap<string, PullRequestFacts> }
	| { readonly type: "missing-pr"; readonly branch: string }
	| { readonly type: "malformed-envelope" }
	| { readonly type: "malformed-connection"; readonly branch: string }
	| { readonly type: "malformed-candidate"; readonly branch: string }
	| {
			readonly type: "ambiguous-open-prs";
			readonly branch: string;
			readonly prNumbers: readonly number[];
	  };

interface GhJsonRequest<T> {
	readonly pi: LandExecutionApi;
	readonly repoRoot: string;
	readonly args: readonly string[];
	readonly execFailureMessage: string;
	readonly parseFailureMessage: (error: unknown) => string;
	readonly validationFailureMessage: string;
	readonly parse: (value: unknown) => T | undefined;
}

export const GH_REPO_VIEW_NAME_WITH_OWNER_ARGS = ["repo", "view", "--json", "nameWithOwner"];

/**
 * Page size and page bound for the complete open-PR dependency scan. The bound exists only to
 * turn a pathological repository into an explicit fail-closed error instead of an unbounded
 * loop; it must never silently truncate results.
 */
export const OPEN_PR_DEPENDENCY_PAGE_SIZE = 100;
export const OPEN_PR_DEPENDENCY_MAX_PAGES = 50;

const OPEN_PR_DEPENDENCY_QUERY = `query($owner: String!, $name: String!, $cursor: String) { repository(owner: $owner, name: $name) { pullRequests(states: OPEN, first: ${OPEN_PR_DEPENDENCY_PAGE_SIZE}, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { number headRefName headRefOid baseRefName baseRefOid } } } }`;

export function openPullRequestDependencyFactsGraphqlArgs(
	repo: GitHubRepositoryName,
	cursor?: string,
): string[] {
	return [
		"api",
		"graphql",
		"-F",
		`owner=${repo.owner}`,
		"-F",
		`name=${repo.name}`,
		...(cursor === undefined ? [] : ["-F", `cursor=${cursor}`]),
		"-f",
		`query=${OPEN_PR_DEPENDENCY_QUERY}`,
	];
}

interface OpenPullRequestDependencyPage {
	readonly nodes: readonly PullRequestDependencyFacts[];
	readonly hasNextPage: boolean;
	readonly endCursor: string | null;
}

/**
 * Complete, paginated scan of open pull requests, filtered to those whose base ref name or
 * observed base OID matches a requested dependency key. Answers the domain question "which open
 * PRs may depend on these landing branches?" against remote GitHub facts rather than provider
 * topology.
 */
export async function loadOpenPullRequestDependents(
	pi: LandExecutionApi,
	repoRoot: string,
	baseRefNames: readonly string[],
	baseRefOids: readonly string[],
): Promise<LandResult<readonly PullRequestDependencyFacts[]>> {
	if (baseRefNames.length === 0 && baseRefOids.length === 0) return landSuccess([]);

	const repo = await loadGitHubRepositoryName(pi, repoRoot);
	if (repo.type === "failure") return repo;

	const baseRefNameSet = new Set(baseRefNames);
	const baseRefOidSet = new Set(baseRefOids);
	const dependents: PullRequestDependencyFacts[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < OPEN_PR_DEPENDENCY_MAX_PAGES; page += 1) {
		const parsed = await execAndParseJson({
			pi,
			repoRoot,
			args: openPullRequestDependencyFactsGraphqlArgs(repo.value, cursor),
			execFailureMessage: "Could not load open GitHub pull requests for dependency reconciliation.",
			parseFailureMessage: (error) =>
				`Failed to parse gh api graphql open-PR dependency output: ${formatErrorMessage(error)}.`,
			validationFailureMessage:
				"gh api graphql open-PR dependency output did not match the expected shape.",
			parse: parseOpenPullRequestDependencyPage,
		});
		if (parsed.type === "failure") return parsed;
		for (const node of parsed.value.nodes) {
			if (baseRefNameSet.has(node.baseRefName) || baseRefOidSet.has(node.baseRefOid)) {
				dependents.push(node);
			}
		}
		if (!parsed.value.hasNextPage) return landSuccess(dependents);
		if (parsed.value.endCursor === null) {
			return landFailure(
				landingExecutionFailure(
					"gh api graphql open-PR dependency output reported another page without an end cursor; refusing to land with an incomplete dependency scan.",
				),
			);
		}
		cursor = parsed.value.endCursor;
	}
	return landFailure(
		landingExecutionFailure(
			`Open pull request dependency scan exceeded ${OPEN_PR_DEPENDENCY_MAX_PAGES * OPEN_PR_DEPENDENCY_PAGE_SIZE} open PRs; refusing to land with an incomplete dependency scan.`,
		),
	);
}

function parseOpenPullRequestDependencyPage(
	value: unknown,
): OpenPullRequestDependencyPage | undefined {
	if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.repository)) {
		return undefined;
	}
	const connection = value.data.repository.pullRequests;
	if (!isRecord(connection) || !Array.isArray(connection.nodes) || !isRecord(connection.pageInfo)) {
		return undefined;
	}
	const { hasNextPage, endCursor } = connection.pageInfo;
	if (typeof hasNextPage !== "boolean") return undefined;
	if (typeof endCursor !== "string" && endCursor !== null) return undefined;
	const nodes: PullRequestDependencyFacts[] = [];
	for (const node of connection.nodes) {
		const parsedNode = parsePullRequestDependencyFacts(node);
		if (parsedNode === undefined) return undefined;
		nodes.push(parsedNode);
	}
	return { nodes, hasNextPage, endCursor };
}

function parsePullRequestDependencyFacts(value: unknown): PullRequestDependencyFacts | undefined {
	if (
		!isRecord(value) ||
		typeof value.number !== "number" ||
		!Number.isFinite(value.number) ||
		typeof value.headRefName !== "string" ||
		typeof value.headRefOid !== "string" ||
		typeof value.baseRefName !== "string" ||
		typeof value.baseRefOid !== "string"
	) {
		return undefined;
	}
	return {
		number: value.number,
		headRefName: value.headRefName,
		headRefOid: value.headRefOid,
		baseRefName: value.baseRefName,
		baseRefOid: value.baseRefOid,
	};
}

export function batchedPullRequestFactsGraphqlArgs(
	repo: GitHubRepositoryName,
	branches: readonly string[],
): string[] {
	const variables = branches.flatMap((branch, index) => ["-F", `head${index}=${branch}`]);
	return [
		"api",
		"graphql",
		"-F",
		`owner=${repo.owner}`,
		"-F",
		`name=${repo.name}`,
		...variables,
		"-f",
		`query=${batchedPullRequestFactsQuery(branches.length)}`,
	];
}

export async function loadPr(
	pi: LandExecutionApi,
	repoRoot: string,
	branchOrNumber: string,
): Promise<LandResult<PullRequestFacts>> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	return await execAndParseJson({
		pi,
		repoRoot,
		args,
		execFailureMessage: `Could not load GitHub PR for ${branchOrNumber}.`,
		parseFailureMessage: (error) =>
			`Failed to parse gh pr view output for ${branchOrNumber}: ${formatErrorMessage(error)}.`,
		validationFailureMessage: `gh pr view for ${branchOrNumber} did not return required PR fields.`,
		parse: parsePullRequestFacts,
	});
}

export async function loadPrsByBranch(
	pi: LandExecutionApi,
	repoRoot: string,
	branches: readonly string[],
): Promise<LandResult<ReadonlyMap<string, PullRequestFacts>>> {
	if (branches.length === 0) return landSuccess(new Map());

	const repo = await loadGitHubRepositoryName(pi, repoRoot);
	if (repo.type === "failure") return repo;

	const args = batchedPullRequestFactsGraphqlArgs(repo.value, branches);
	const parsed = await execAndParseJson({
		pi,
		repoRoot,
		args,
		execFailureMessage: "Could not load batched GitHub PR facts.",
		parseFailureMessage: (error) =>
			`Failed to parse batched gh api graphql PR output: ${formatErrorMessage(error)}.`,
		validationFailureMessage: "Batched gh api graphql PR output could not be classified.",
		parse: (value) => parseBatchedPullRequestFacts(value, branches),
	});
	if (parsed.type === "failure") return parsed;

	switch (parsed.value.type) {
		case "success":
			return landSuccess(parsed.value.prs);
		case "missing-pr":
			return landFailure(
				landingExecutionFailure(
					`No GitHub pull request is associated with branch ${parsed.value.branch}.`,
				),
			);
		case "malformed-envelope":
			return landFailure(
				landingExecutionFailure(
					"Batched gh api graphql PR output had a malformed top-level envelope.",
				),
			);
		case "malformed-connection":
			return landFailure(
				landingExecutionFailure(
					`Batched gh api graphql PR output had a malformed PR connection for branch ${parsed.value.branch}.`,
				),
			);
		case "malformed-candidate":
			return landFailure(
				landingExecutionFailure(
					`Batched gh api graphql PR output had malformed PR candidate data for branch ${parsed.value.branch}.`,
				),
			);
		case "ambiguous-open-prs":
			return landFailure(
				landingExecutionFailure(
					`Multiple open GitHub pull requests are associated with branch ${parsed.value.branch}: ${parsed.value.prNumbers.map((number) => `#${number}`).join(", ")}. Flow cannot choose safely.`,
				),
			);
		default:
			return assertNever(parsed.value);
	}
}

async function loadGitHubRepositoryName(
	pi: LandExecutionApi,
	repoRoot: string,
): Promise<LandResult<GitHubRepositoryName>> {
	return await execAndParseJson({
		pi,
		repoRoot,
		args: GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
		execFailureMessage: "Could not resolve GitHub repository name.",
		parseFailureMessage: (error) =>
			`Failed to parse gh repo view output: ${formatErrorMessage(error)}.`,
		validationFailureMessage: "gh repo view did not return nameWithOwner.",
		parse: parseGitHubRepositoryName,
	});
}

async function execAndParseJson<T>(request: GhJsonRequest<T>): Promise<LandResult<T>> {
	const args = [...request.args];
	const result = await exec({
		pi: request.pi,
		command: "gh",
		args,
		cwd: request.repoRoot,
		timeoutMs: GH_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		return landFailure(
			landingExecutionFailure(
				`${request.execFailureMessage}\n${formatCommandDetails(result, formatCommand("gh", args))}`,
			),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return landFailure(landingExecutionFailure(request.parseFailureMessage(error)));
	}

	const parsed = request.parse(raw);
	if (parsed === undefined)
		return landFailure(landingExecutionFailure(request.validationFailureMessage));
	return landSuccess(parsed);
}

function batchedPullRequestFactsQuery(branchCount: number): string {
	const variableDeclarations = [
		"$owner: String!",
		"$name: String!",
		...Array.from({ length: branchCount }, (_, index) => `$head${index}: String!`),
	].join(", ");
	const prSelection = PR_FIELD_NAMES.join(" ");
	const selections = Array.from({ length: branchCount }, (_, index) =>
		[
			`open${index}: pullRequests(headRefName: $head${index}, states: OPEN, first: 2) { nodes { ${prSelection} } }`,
			`history${index}: pullRequests(headRefName: $head${index}, states: [CLOSED, MERGED], first: 1, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${prSelection} } }`,
		].join(" "),
	).join(" ");
	return `query(${variableDeclarations}) { repository(owner: $owner, name: $name) { ${selections} } }`;
}

function parseGitHubRepositoryName(value: unknown): GitHubRepositoryName | undefined {
	if (!isRecord(value) || typeof value.nameWithOwner !== "string") return undefined;
	const separator = value.nameWithOwner.indexOf("/");
	if (separator <= 0 || separator === value.nameWithOwner.length - 1) return undefined;
	return {
		owner: value.nameWithOwner.slice(0, separator),
		name: value.nameWithOwner.slice(separator + 1),
	};
}

function parseBatchedPullRequestFacts(
	value: unknown,
	branches: readonly string[],
): BatchedPullRequestParseResult {
	if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.repository)) {
		return { type: "malformed-envelope" };
	}

	const prs = new Map<string, PullRequestFacts>();
	for (const [index, branch] of branches.entries()) {
		const openConnection = value.data.repository[`open${index}`];
		const historyConnection = value.data.repository[`history${index}`];
		if (
			!isRecord(openConnection) ||
			!Array.isArray(openConnection.nodes) ||
			!isRecord(historyConnection) ||
			!Array.isArray(historyConnection.nodes)
		) {
			return { type: "malformed-connection", branch };
		}

		const openCandidates = parsePullRequestCandidates(openConnection.nodes);
		const historicalCandidates = parsePullRequestCandidates(historyConnection.nodes);
		if (openCandidates === undefined || historicalCandidates === undefined) {
			return { type: "malformed-candidate", branch };
		}
		if (openCandidates.length > 1) {
			return {
				type: "ambiguous-open-prs",
				branch,
				prNumbers: openCandidates.map((candidate) => candidate.number),
			};
		}

		const selected = openCandidates[0] ?? historicalCandidates[0];
		if (selected === undefined) return { type: "missing-pr", branch };
		prs.set(branch, selected);
	}
	return { type: "success", prs };
}

function parsePullRequestCandidates(
	values: readonly unknown[],
): readonly PullRequestFacts[] | undefined {
	const candidates: PullRequestFacts[] = [];
	for (const value of values) {
		const candidate = parsePullRequestFacts(value);
		if (candidate === undefined) return undefined;
		candidates.push(candidate);
	}
	return candidates;
}

function parsePullRequestFacts(value: unknown): PullRequestFacts | undefined {
	if (!isRecord(value)) return undefined;

	const body = value.body;
	if (
		typeof value.id !== "string" ||
		typeof value.number !== "number" ||
		!Number.isFinite(value.number) ||
		typeof value.title !== "string" ||
		(typeof body !== "string" && body !== null) ||
		typeof value.state !== "string" ||
		typeof value.isDraft !== "boolean" ||
		typeof value.headRefName !== "string" ||
		typeof value.baseRefName !== "string" ||
		typeof value.baseRefOid !== "string" ||
		typeof value.headRefOid !== "string"
	) {
		return undefined;
	}

	return {
		id: value.id,
		number: value.number,
		title: value.title,
		body,
		state: value.state,
		isDraft: value.isDraft,
		headRefName: value.headRefName,
		baseRefName: value.baseRefName,
		baseRefOid: value.baseRefOid,
		headRefOid: value.headRefOid,
		...(typeof value.mergeStateStatus === "string"
			? { mergeStateStatus: value.mergeStateStatus }
			: {}),
		...(typeof value.url === "string" ? { url: value.url } : {}),
		...(typeof value.mergedAt === "string" || value.mergedAt === null
			? { mergedAt: value.mergedAt }
			: {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
	throw new Error(`Unhandled batched pull request parse result: ${JSON.stringify(value)}`);
}
