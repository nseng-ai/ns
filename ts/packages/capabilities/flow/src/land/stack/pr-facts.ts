import { formatCommand } from "@ns/core/command";
import { formatErrorMessage } from "@ns/core/primitives";

import { exec, formatCommandDetails } from "./command-exec.ts";
import { GH_TIMEOUT_MS, PR_FIELDS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import type { LandStackExtensionAPI, PullRequestSnapshot } from "./types.ts";

interface GitHubRepositoryName {
	readonly owner: string;
	readonly name: string;
}

interface BatchedPullRequestParseResult {
	readonly prs: ReadonlyMap<string, PullRequestSnapshot>;
}

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
): Promise<LandStackResult<PullRequestSnapshot>> {
	const args = ["pr", "view", branchOrNumber, "--json", PR_FIELDS];
	const result = await exec({ pi, command: "gh", args, cwd: repoRoot, timeoutMs: GH_TIMEOUT_MS });
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not load GitHub PR for ${branchOrNumber}.\n${formatCommandDetails(result, formatCommand("gh", args))}`,
			),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return failure(
			landStackFailure(
				`Failed to parse gh pr view output for ${branchOrNumber}: ${formatErrorMessage(error)}.`,
			),
		);
	}

	const pr = parsePullRequestSnapshot(raw);
	if (pr === undefined) {
		return failure(
			landStackFailure(`gh pr view for ${branchOrNumber} did not return required PR fields.`),
		);
	}
	return success(pr);
}

export async function loadPrsByBranch(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branches: readonly string[],
): Promise<LandStackResult<ReadonlyMap<string, PullRequestSnapshot>>> {
	if (branches.length === 0) return success(new Map());
	if (branches.length === 1) {
		const [branch] = branches;
		if (branch === undefined) return success(new Map());
		const pr = await loadPr(pi, repoRoot, branch);
		if (pr.type === "failure") return pr;
		return success(new Map([[branch, pr.value]]));
	}

	const repo = await loadGitHubRepositoryName(pi, repoRoot);
	if (repo.type === "failure") return repo;

	const args = batchedPullRequestFactsGraphqlArgs(repo.value, branches);
	const result = await exec({ pi, command: "gh", args, cwd: repoRoot, timeoutMs: GH_TIMEOUT_MS });
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not load batched GitHub PR facts.\n${formatCommandDetails(result, formatCommand("gh", args))}`,
			),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return failure(
			landStackFailure(
				`Failed to parse batched gh api graphql PR output: ${formatErrorMessage(error)}.`,
			),
		);
	}

	const parsed = parseBatchedPullRequestFacts(raw, branches);
	if (parsed === undefined) {
		return failure(landStackFailure("Batched gh api graphql PR output had an unexpected shape."));
	}
	return success(parsed.prs);
}

async function loadGitHubRepositoryName(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandStackResult<GitHubRepositoryName>> {
	const result = await exec({
		pi,
		command: "gh",
		args: GH_REPO_VIEW_NAME_WITH_OWNER_ARGS,
		cwd: repoRoot,
		timeoutMs: GH_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not resolve GitHub repository name.\n${formatCommandDetails(result, formatCommand("gh", GH_REPO_VIEW_NAME_WITH_OWNER_ARGS))}`,
			),
		);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(result.stdout);
	} catch (error) {
		return failure(
			landStackFailure(`Failed to parse gh repo view output: ${formatErrorMessage(error)}.`),
		);
	}

	const repo = parseGitHubRepositoryName(raw);
	if (repo === undefined) {
		return failure(landStackFailure("gh repo view did not return nameWithOwner."));
	}
	return success(repo);
}

function batchedPullRequestFactsQuery(branchCount: number): string {
	const variableDeclarations = [
		"$owner: String!",
		"$name: String!",
		...Array.from({ length: branchCount }, (_, index) => `$head${index}: String!`),
	].join(", ");
	const selections = Array.from(
		{ length: branchCount },
		(_, index) =>
			`b${index}: pullRequests(headRefName: $head${index}, states: OPEN, first: 1) { nodes { number title body state isDraft headRefName baseRefName headRefOid mergeStateStatus url mergedAt } }`,
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
): BatchedPullRequestParseResult | undefined {
	if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.repository)) {
		return undefined;
	}

	const prs = new Map<string, PullRequestSnapshot>();
	for (let index = 0; index < branches.length; index += 1) {
		const branch = branches[index];
		if (branch === undefined) return undefined;
		const connection = value.data.repository[`b${index}`];
		if (
			!isRecord(connection) ||
			!Array.isArray(connection.nodes) ||
			connection.nodes.length !== 1
		) {
			return undefined;
		}
		const [node] = connection.nodes;
		const pr = parsePullRequestSnapshot(node);
		if (pr === undefined) return undefined;
		prs.set(branch, pr);
	}
	return { prs };
}

function parsePullRequestSnapshot(value: unknown): PullRequestSnapshot | undefined {
	if (!isRecord(value)) return undefined;

	const body = value.body;
	if (
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
