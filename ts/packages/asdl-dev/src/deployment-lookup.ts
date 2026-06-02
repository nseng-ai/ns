import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	resolveVercelCommandPrefix,
	type CommandResolver,
	type CommandResult,
	type CommandRunner,
} from "./command-runner.ts";

const DEFAULT_PROJECT = "asdl-tools";
const DEFAULT_SCOPE = "schrockns-projects";
const BRANCH_METADATA_KEYS = ["githubCommitRef", "gitCommitRef"] as const;
const STDERR_DETAIL_LIMIT = 1_200;

type BranchMetadataKey = (typeof BRANCH_METADATA_KEYS)[number];

type ErrorExitCode = 1 | 2;

export type ErrorInfo = {
	code: string;
	message: string;
	details?: Record<string, unknown>;
};

export type ParseResult<T> =
	| {
			ok: true;
			value: T;
	  }
	| {
			ok: false;
			error: ErrorInfo;
	  };

export type DeploymentCandidate = {
	url: string;
	state: string;
	createdAt: number;
	readyAt?: number;
	meta: Record<string, string>;
};

export type InspectedDeployment = {
	id: string;
	url: string;
	aliases: string[];
};

export type SuccessDeploymentPayload = {
	id: string;
	created_at_ms: number;
	ready_at_ms?: number;
	commit_sha?: string;
	pr_number?: number;
};

export type SuccessPayload = {
	success: true;
	branch: string;
	preview_url: string;
	deployment_url: string;
	dashboard_url: string;
	project: string;
	scope: string;
	deployment: SuccessDeploymentPayload;
	evidence: {
		source: "vercel_cli_metadata";
		metadata_keys: string[];
	};
	warnings: string[];
};

export type FailurePayload = {
	success: false;
	error: ErrorInfo;
	branch?: string;
	project?: string;
	scope?: string;
	warnings?: string[];
};

export type LookupResult =
	| {
			exitCode: 0;
			payload: SuccessPayload;
	  }
	| {
			exitCode: ErrorExitCode;
			payload: FailurePayload;
	  };

export type LatestBranchDeploymentOptions = {
	branch?: string;
	project?: string;
	scope?: string;
	cwd: string;
	env: Record<string, string | undefined>;
	runner: CommandRunner;
	resolveCommand: CommandResolver;
};

export function parseDeploymentList(stdout: string): ParseResult<DeploymentCandidate[]> {
	const parsed = parseJson(stdout, "Vercel deployment list");
	if (!parsed.ok) return parsed;

	const root = asRecord(parsed.value);
	if (root === undefined || !Array.isArray(root.deployments)) {
		return parseFailure("vercel_deployment_list_shape_error", "Vercel deployment list JSON did not contain a deployments array.");
	}

	const deployments: DeploymentCandidate[] = [];
	for (const item of root.deployments) {
		const record = asRecord(item);
		if (record === undefined) continue;

		const url = stringField(record, "url");
		const state = stringField(record, "state");
		const createdAt = numberField(record, "createdAt");
		if (url === undefined || state === undefined || createdAt === undefined) continue;

		const readyAt = numberField(record, "ready");
		const deployment: DeploymentCandidate = {
			url,
			state,
			createdAt,
			meta: stringRecordField(record, "meta"),
		};
		if (readyAt !== undefined) {
			deployment.readyAt = readyAt;
		}
		deployments.push(deployment);
	}

	return { ok: true, value: deployments };
}

export function parseInspectDeployment(stdout: string): ParseResult<InspectedDeployment> {
	const parsed = parseJson(stdout, "Vercel inspect");
	if (!parsed.ok) return parsed;

	const root = asRecord(parsed.value);
	if (root === undefined) {
		return parseFailure("vercel_inspect_shape_error", "Vercel inspect JSON was not an object.");
	}

	const id = stringField(root, "id");
	const url = stringField(root, "url");
	if (id === undefined || url === undefined) {
		return parseFailure("vercel_inspect_shape_error", "Vercel inspect JSON was missing required id or url fields.");
	}

	return {
		ok: true,
		value: {
			id,
			url,
			aliases: stringArrayField(root, "aliases"),
		},
	};
}

export function dedupeDeployments(candidates: readonly DeploymentCandidate[]): DeploymentCandidate[] {
	const byUrl = new Map<string, DeploymentCandidate>();
	for (const candidate of candidates) {
		const existing = byUrl.get(candidate.url);
		if (existing === undefined || candidate.createdAt >= existing.createdAt) {
			const merged: DeploymentCandidate = {
				url: candidate.url,
				state: candidate.state,
				createdAt: candidate.createdAt,
				meta: { ...(existing?.meta ?? {}), ...candidate.meta },
			};
			if (candidate.readyAt !== undefined) {
				merged.readyAt = candidate.readyAt;
			} else if (existing?.readyAt !== undefined) {
				merged.readyAt = existing.readyAt;
			}
			byUrl.set(candidate.url, merged);
			continue;
		}

		const merged: DeploymentCandidate = {
			url: existing.url,
			state: existing.state,
			createdAt: existing.createdAt,
			meta: { ...existing.meta, ...candidate.meta },
		};
		if (existing.readyAt !== undefined) {
			merged.readyAt = existing.readyAt;
		} else if (candidate.readyAt !== undefined) {
			merged.readyAt = candidate.readyAt;
		}
		byUrl.set(candidate.url, merged);
	}

	return [...byUrl.values()];
}

export function selectLatestBranchDeployment(
	candidates: readonly DeploymentCandidate[],
	branch: string,
): DeploymentCandidate | undefined {
	let selected: DeploymentCandidate | undefined;
	for (const candidate of candidates) {
		if (candidate.state !== "READY") continue;
		if (matchingMetadataKeys(candidate, branch).length === 0) continue;
		if (selected === undefined || candidate.createdAt > selected.createdAt) {
			selected = candidate;
		}
	}
	return selected;
}

export function resolvePreviewUrl(candidate: DeploymentCandidate, inspected: InspectedDeployment): string {
	const deploymentUrl = toHttpsUrl(inspected.url || candidate.url);
	const branchAlias = candidate.meta.branchAlias;
	if (branchAlias !== undefined && inspected.aliases.includes(branchAlias)) {
		return toHttpsUrl(branchAlias);
	}

	const firstAlias = inspected.aliases[0];
	if (firstAlias !== undefined) {
		return toHttpsUrl(firstAlias);
	}

	return deploymentUrl;
}

export function dashboardUrl(scope: string, project: string, deploymentId: string): string {
	const dashboardId = deploymentId.startsWith("dpl_") ? deploymentId.slice("dpl_".length) : deploymentId;
	return `https://vercel.com/${scope}/${project}/${dashboardId}`;
}

export function buildSuccessPayload(params: {
	branch: string;
	project: string;
	scope: string;
	candidate: DeploymentCandidate;
	inspected: InspectedDeployment;
	warnings: readonly string[];
}): SuccessPayload {
	const deploymentUrl = toHttpsUrl(params.inspected.url || params.candidate.url);
	const deployment: SuccessDeploymentPayload = {
		id: params.inspected.id,
		created_at_ms: params.candidate.createdAt,
	};
	if (params.candidate.readyAt !== undefined) {
		deployment.ready_at_ms = params.candidate.readyAt;
	}

	const commitSha = params.candidate.meta.githubCommitSha ?? params.candidate.meta.gitCommitSha;
	if (commitSha !== undefined) {
		deployment.commit_sha = commitSha;
	}

	const prNumber = parsePrNumber(params.candidate.meta.githubPrId);
	if (prNumber !== undefined) {
		deployment.pr_number = prNumber;
	}

	return {
		success: true,
		branch: params.branch,
		preview_url: resolvePreviewUrl(params.candidate, params.inspected),
		deployment_url: deploymentUrl,
		dashboard_url: dashboardUrl(params.scope, params.project, params.inspected.id),
		project: params.project,
		scope: params.scope,
		deployment,
		evidence: {
			source: "vercel_cli_metadata",
			metadata_keys: matchingMetadataKeys(params.candidate, params.branch),
		},
		warnings: [...params.warnings],
	};
}

export async function latestBranchDeployment(options: LatestBranchDeploymentOptions): Promise<LookupResult> {
	const explicitBranch = nonBlank(options.branch);
	const branchResult = explicitBranch === undefined ? await currentGitBranch(options.runner, options.cwd) : explicitBranch;
	if (typeof branchResult !== "string") {
		return failure(branchResult.exitCode, branchResult.error.code, branchResult.error.message, {
			details: branchResult.error.details,
		});
	}
	const branch = branchResult;

	const repoRoot = await resolveRepoRoot(options.runner, options.cwd);
	const warnings: string[] = [];
	const projectResult = await resolveProject(repoRoot, options.project, options.env);
	warnings.push(...projectResult.warnings);
	const project = projectResult.project;
	const scope = nonBlank(options.scope) ?? nonBlank(options.env.VERCEL_SCOPE) ?? DEFAULT_SCOPE;

	const vercelPrefix = resolveVercelCommandPrefix(options.resolveCommand);
	if (vercelPrefix === undefined) {
		return failure(2, "vercel_cli_unavailable", "Neither vercel nor bunx was found on PATH; cannot query Vercel deployments.", {
			branch,
			project,
			scope,
			warnings,
		});
	}

	const deploymentCandidates: DeploymentCandidate[] = [];
	for (const metadataKey of BRANCH_METADATA_KEYS) {
		const result = await options.runner(
			vercelPrefix.command,
			[
				...vercelPrefix.args,
				"ls",
				project,
				"--scope",
				scope,
				"--format=json",
				"--status",
				"READY",
				"--environment",
				"preview",
				"-m",
				`${metadataKey}=${branch}`,
				"--non-interactive",
			],
			{ cwd: repoRoot },
		);
		const commandError = commandFailure(result, "vercel_list_failed", `Vercel deployment list command failed for ${metadataKey}=${branch}.`);
		if (commandError !== undefined) {
			return failure(2, commandError.code, commandError.message, {
				branch,
				project,
				scope,
				warnings,
				details: commandError.details,
			});
		}

		const parsed = parseDeploymentList(result.stdout);
		if (!parsed.ok) {
			return failure(2, parsed.error.code, parsed.error.message, {
				branch,
				project,
				scope,
				warnings,
				details: { metadata_key: metadataKey },
			});
		}
		deploymentCandidates.push(...parsed.value);
	}

	const selected = selectLatestBranchDeployment(dedupeDeployments(deploymentCandidates), branch);
	if (selected === undefined) {
		return failure(1, "no_matching_deployment", `No READY preview deployment found for branch ${branch} in Vercel project ${project}.`, {
			branch,
			project,
			scope,
			warnings,
		});
	}

	const inspectResult = await options.runner(
		vercelPrefix.command,
		[...vercelPrefix.args, "inspect", toHttpsUrl(selected.url), "--scope", scope, "--format=json", "--non-interactive"],
		{ cwd: repoRoot },
	);
	const inspectError = commandFailure(inspectResult, "vercel_inspect_failed", `Vercel inspect command failed for deployment ${selected.url}.`);
	if (inspectError !== undefined) {
		return failure(2, inspectError.code, inspectError.message, {
			branch,
			project,
			scope,
			warnings,
			details: inspectError.details,
		});
	}

	const inspected = parseInspectDeployment(inspectResult.stdout);
	if (!inspected.ok) {
		return failure(2, inspected.error.code, inspected.error.message, {
			branch,
			project,
			scope,
			warnings,
		});
	}

	return {
		exitCode: 0,
		payload: buildSuccessPayload({ branch, project, scope, candidate: selected, inspected: inspected.value, warnings }),
	};
}

function parseJson(stdout: string, description: string): ParseResult<unknown> {
	try {
		return { ok: true, value: JSON.parse(stdout) as unknown };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return parseFailure("vercel_json_parse_error", `${description} output was not valid JSON.`, { parse_error: message });
	}
}

function parseFailure(code: string, message: string, details?: Record<string, unknown>): ParseResult<never> {
	const error: ErrorInfo = { code, message };
	if (details !== undefined) {
		error.details = details;
	}
	return { ok: false, error };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			return numericValue;
		}
	}
	return undefined;
}

function stringRecordField(record: Record<string, unknown>, key: string): Record<string, string> {
	const value = asRecord(record[key]);
	if (value === undefined) return {};

	const output: Record<string, string> = {};
	for (const [entryKey, entryValue] of Object.entries(value)) {
		if (typeof entryValue === "string") {
			output[entryKey] = entryValue;
		}
	}
	return output;
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
	const value = record[key];
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function matchingMetadataKeys(candidate: DeploymentCandidate, branch: string): BranchMetadataKey[] {
	return BRANCH_METADATA_KEYS.filter((key) => candidate.meta[key] === branch);
}

function parsePrNumber(value: string | undefined): number | undefined {
	if (value === undefined || !/^\d+$/.test(value)) {
		return undefined;
	}
	return Number(value);
}

function toHttpsUrl(value: string): string {
	if (/^https?:\/\//.test(value)) {
		return value;
	}
	return `https://${value}`;
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

async function currentGitBranch(runner: CommandRunner, cwd: string): Promise<string | { exitCode: ErrorExitCode; error: ErrorInfo }> {
	const result = await runner("git", ["branch", "--show-current"], { cwd });
	const commandError = commandFailure(result, "branch_unresolved", "Could not resolve the current git branch.");
	if (commandError !== undefined) {
		return { exitCode: 1, error: commandError };
	}

	const branch = nonBlank(result.stdout);
	if (branch === undefined) {
		return { exitCode: 1, error: { code: "detached_head", message: "Could not determine current branch; HEAD may be detached. Pass --branch to select a branch explicitly." } };
	}

	return branch;
}

async function resolveRepoRoot(runner: CommandRunner, cwd: string): Promise<string> {
	const result = await runner("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.exitCode !== 0 || result.startupError !== undefined) {
		return cwd;
	}
	return nonBlank(result.stdout) ?? cwd;
}

async function resolveProject(
	repoRoot: string,
	explicitProject: string | undefined,
	env: Record<string, string | undefined>,
): Promise<{ project: string; warnings: string[] }> {
	const project = nonBlank(explicitProject) ?? nonBlank(env.VERCEL_PROJECT);
	if (project !== undefined) {
		return { project, warnings: [] };
	}

	const projectJsonPath = join(repoRoot, ".vercel", "project.json");
	try {
		const content = await readFile(projectJsonPath, "utf8");
		const parsed = JSON.parse(content) as unknown;
		const record = asRecord(parsed);
		const projectName = record === undefined ? undefined : nonBlank(stringField(record, "projectName"));
		if (projectName !== undefined) {
			return { project: projectName, warnings: [] };
		}
		return {
			project: DEFAULT_PROJECT,
			warnings: [`${projectJsonPath} did not contain a projectName; using ${DEFAULT_PROJECT}.`],
		};
	} catch (error) {
		if (isMissingFileError(error)) {
			return { project: DEFAULT_PROJECT, warnings: [] };
		}
		return {
			project: DEFAULT_PROJECT,
			warnings: [`Could not read ${projectJsonPath}; using ${DEFAULT_PROJECT}.`],
		};
	}
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function commandFailure(result: CommandResult, code: string, message: string): ErrorInfo | undefined {
	if (result.exitCode === 0 && result.startupError === undefined) {
		return undefined;
	}

	const details: Record<string, unknown> = {
		command: result.command,
		args: result.args,
		exit_code: result.exitCode,
	};
	if (result.startupError !== undefined) {
		details.startup_error = result.startupError;
	}
	const stderr = tailText(result.stderr, STDERR_DETAIL_LIMIT);
	if (stderr !== "") {
		details.stderr = stderr;
	}

	return { code, message, details };
}

function tailText(text: string, maxChars: number): string {
	const trimmed = text.trim();
	if (trimmed.length <= maxChars) {
		return trimmed;
	}
	return `…${trimmed.slice(-maxChars)}`;
}

function failure(
	exitCode: ErrorExitCode,
	code: string,
	message: string,
	context: {
		branch?: string | undefined;
		project?: string | undefined;
		scope?: string | undefined;
		warnings?: readonly string[] | undefined;
		details?: Record<string, unknown> | undefined;
	} = {},
): LookupResult {
	const error: ErrorInfo = { code, message };
	if (context.details !== undefined) {
		error.details = context.details;
	}

	const payload: FailurePayload = { success: false, error };
	if (context.branch !== undefined) {
		payload.branch = context.branch;
	}
	if (context.project !== undefined) {
		payload.project = context.project;
	}
	if (context.scope !== undefined) {
		payload.scope = context.scope;
	}
	if (context.warnings !== undefined && context.warnings.length > 0) {
		payload.warnings = [...context.warnings];
	}

	return { exitCode, payload };
}
