import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import { exec, formatCommandDetails } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELD_NAMES, PR_FIELDS } from "./constants.ts";
import { landFailure, landingExecutionFailure, landSuccess, type LandResult } from "../results.ts";
import type { PullRequestFacts } from "../types.ts";
import type { LandStackExtensionAPI } from "./types.ts";

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
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly args: readonly string[];
	readonly execFailureMessage: string;
	readonly parseFailureMessage: (error: unknown) => string;
	readonly validationFailureMessage: string;
	readonly parse: (value: unknown) => T | undefined;
}

const BATCHED_PULL_REQUEST_FACTS_MIN_BRANCHES = 3;

export const GH_REPO_VIEW_NAME_WITH_OWNER_ARGS = ["repo", "view", "--json", "nameWithOwner"];

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
	pi: LandStackExtensionAPI,
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
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branches: readonly string[],
): Promise<LandResult<ReadonlyMap<string, PullRequestFacts>>> {
	if (branches.length === 0) return landSuccess(new Map());
	if (branches.length < BATCHED_PULL_REQUEST_FACTS_MIN_BRANCHES) {
		return await loadPrsByBranchSequentially(pi, repoRoot, branches);
	}

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
	pi: LandStackExtensionAPI,
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

async function loadPrsByBranchSequentially(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branches: readonly string[],
): Promise<LandResult<ReadonlyMap<string, PullRequestFacts>>> {
	const prs = new Map<string, PullRequestFacts>();
	for (const branch of branches) {
		const pr = await loadPr(pi, repoRoot, branch);
		if (pr.type === "failure") return pr;
		prs.set(branch, pr.value);
	}
	return landSuccess(prs);
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
	const selections = Array.from(
		{ length: branchCount },
		(_, index) =>
			`b${index}: pullRequests(headRefName: $head${index}, first: 10, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${prSelection} } }`,
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
		const connection = value.data.repository[`b${index}`];
		if (!isRecord(connection) || !Array.isArray(connection.nodes)) {
			return { type: "malformed-connection", branch };
		}
		if (connection.nodes.length === 0) return { type: "missing-pr", branch };

		const [firstNode, ...remainingNodes] = connection.nodes;
		const firstCandidate = parsePullRequestFacts(firstNode);
		if (firstCandidate === undefined) return { type: "malformed-candidate", branch };
		const candidates = [firstCandidate];
		for (const node of remainingNodes) {
			const candidate = parsePullRequestFacts(node);
			if (candidate === undefined) return { type: "malformed-candidate", branch };
			candidates.push(candidate);
		}

		const openCandidates = candidates.filter((candidate) => candidate.state === "OPEN");
		if (openCandidates.length > 1) {
			return {
				type: "ambiguous-open-prs",
				branch,
				prNumbers: openCandidates.map((candidate) => candidate.number),
			};
		}
		prs.set(branch, openCandidates[0] ?? firstCandidate);
	}
	return { type: "success", prs };
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
