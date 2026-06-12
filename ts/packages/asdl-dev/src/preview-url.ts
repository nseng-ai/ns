import type { AsdlDevContext } from "./context.ts";
import { projectConfigPath, type ProjectConfigReadResult } from "./gateways/project-config.ts";
import type { DeploymentCandidate, InspectedDeployment } from "./gateways/vercel.ts";
import type { ErrorInfo } from "./result.ts";

export const DEFAULT_PROJECT = "asdl-tools";
export const DEFAULT_SCOPE = "schrockns-projects";
export const GITHUB_COMMIT_REF_METADATA_KEY = "githubCommitRef";

export interface PreviewUrlOptions {
	branch?: string;
	project?: string;
	scope?: string;
	cwd: string;
	env: Record<string, string | undefined>;
}

export interface PreviewUrlDeploymentPayload {
	id: string;
	created_at_ms: number;
	ready_at_ms?: number;
	commit_sha?: string;
	pr_number?: number;
}

export interface PreviewUrlSuccessPayload {
	success: true;
	branch: string;
	preview_url: string;
	deployment_url: string;
	dashboard_url: string;
	project: string;
	scope: string;
	deployment: PreviewUrlDeploymentPayload;
	evidence: {
		source: "vercel_github_commit_ref";
		metadata_keys: [typeof GITHUB_COMMIT_REF_METADATA_KEY];
	};
	warnings: string[];
}

export interface PreviewUrlFailurePayload {
	success: false;
	error: ErrorInfo;
	branch?: string;
	project?: string;
	scope?: string;
	warnings?: string[];
}

export type PreviewUrlPayload = PreviewUrlSuccessPayload | PreviewUrlFailurePayload;

export type PreviewUrlResult =
	| {
			exitCode: 0;
			payload: PreviewUrlSuccessPayload;
	  }
	| {
			exitCode: 1 | 2;
			payload: PreviewUrlFailurePayload;
	  };

export interface ProjectScopeResolution {
	project: string;
	scope: string;
	warnings: string[];
}

export async function lookupPreviewUrl(options: PreviewUrlOptions, context: AsdlDevContext): Promise<PreviewUrlResult> {
	const explicitBranch = nonBlank(options.branch);
	const branchResult = explicitBranch === undefined ? await context.git.currentBranch({ cwd: options.cwd }) : { ok: true as const, value: explicitBranch };
	if (!branchResult.ok) {
		return failure(1, branchResult.error);
	}
	const branch = branchResult.value;

	const repoRootResult = await context.git.repoRoot({ cwd: options.cwd });
	const repoRoot = repoRootResult.ok ? repoRootResult.value : options.cwd;

	const projectScope = await resolveProjectScope({
		explicitProject: options.project,
		explicitScope: options.scope,
		env: options.env,
		repoRoot,
		projectConfig: context.projectConfig,
	});

	const listed = await context.vercel.listReadyPreviewDeployments({
		project: projectScope.project,
		scope: projectScope.scope,
		branch,
		cwd: repoRoot,
	});
	if (!listed.ok) {
		return failure(2, listed.error, { branch, project: projectScope.project, scope: projectScope.scope, warnings: projectScope.warnings });
	}

	const selected = selectNewestDeployment(listed.value);
	if (selected === undefined) {
		return failure(
			1,
			{
				code: "no_matching_deployment",
				message: `No READY preview deployment found for branch ${branch} in Vercel project ${projectScope.project}.`,
			},
			{ branch, project: projectScope.project, scope: projectScope.scope, warnings: projectScope.warnings },
		);
	}

	const inspected = await context.vercel.inspectDeployment({ url: selected.url, scope: projectScope.scope, cwd: repoRoot });
	if (!inspected.ok) {
		return failure(2, inspected.error, { branch, project: projectScope.project, scope: projectScope.scope, warnings: projectScope.warnings });
	}

	return {
		exitCode: 0,
		payload: buildSuccessPayload({ branch, project: projectScope.project, scope: projectScope.scope, candidate: selected, inspected: inspected.value, warnings: projectScope.warnings }),
	};
}

export async function resolveProjectScope(params: {
	explicitProject?: string | undefined;
	explicitScope?: string | undefined;
	env: Record<string, string | undefined>;
	repoRoot: string;
	projectConfig: { readProjectConfig(params: { repoRoot: string }): Promise<ProjectConfigReadResult> };
}): Promise<ProjectScopeResolution> {
	const warnings: string[] = [];
	let project = nonBlank(params.explicitProject) ?? nonBlank(params.env.VERCEL_PROJECT);
	if (project === undefined) {
		const config = await params.projectConfig.readProjectConfig({ repoRoot: params.repoRoot });
		if (config.kind === "found") {
			project = config.projectName;
		} else {
			project = DEFAULT_PROJECT;
			if (config.kind === "invalid") {
				warnings.push(`${projectConfigPath(params.repoRoot)} did not contain a projectName; using ${DEFAULT_PROJECT}.`);
			} else if (config.kind === "read_error") {
				warnings.push(`Could not read ${projectConfigPath(params.repoRoot)}; using ${DEFAULT_PROJECT}.`);
			}
		}
	}

	const scope = nonBlank(params.explicitScope) ?? nonBlank(params.env.VERCEL_SCOPE) ?? DEFAULT_SCOPE;
	return { project, scope, warnings };
}

export function selectNewestDeployment(candidates: readonly DeploymentCandidate[]): DeploymentCandidate | undefined {
	let selected: DeploymentCandidate | undefined;
	for (const candidate of candidates) {
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
}): PreviewUrlSuccessPayload {
	const deploymentUrl = toHttpsUrl(params.inspected.url || params.candidate.url);
	const deployment: PreviewUrlDeploymentPayload = {
		id: params.inspected.id,
		created_at_ms: params.candidate.createdAt,
	};
	if (params.candidate.readyAt !== undefined) {
		deployment.ready_at_ms = params.candidate.readyAt;
	}

	const commitSha = params.candidate.meta.githubCommitSha;
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
			source: "vercel_github_commit_ref",
			metadata_keys: [GITHUB_COMMIT_REF_METADATA_KEY],
		},
		warnings: [...params.warnings],
	};
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

function failure(
	exitCode: 1 | 2,
	error: ErrorInfo,
	context: {
		branch?: string | undefined;
		project?: string | undefined;
		scope?: string | undefined;
		warnings?: readonly string[] | undefined;
	} = {},
): PreviewUrlResult {
	const errorInfo: ErrorInfo = { code: error.code, message: error.message };
	if (error.details !== undefined) {
		errorInfo.details = error.details;
	}
	if (error.displayCommand !== undefined) {
		errorInfo.displayCommand = error.displayCommand;
	}

	const payload: PreviewUrlFailurePayload = { success: false, error: errorInfo };
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
