import type { AsdlDevContext } from "../../src/context.ts";
import type { GitGateway } from "../../src/gateways/git.ts";
import type { ProjectConfigReadResult, VercelProjectConfigStore } from "../../src/gateways/project-config.ts";
import type { DeploymentCandidate, InspectedDeployment, VercelDeploymentGateway } from "../../src/gateways/vercel.ts";
import { err, ok, type ErrorInfo, type GatewayResult } from "../../src/result.ts";

export type FakeCurrentBranchState = string | { kind: "detached" } | { kind: "failure"; error?: ErrorInfo };
export type FakeRepoRootState = string | { kind: "failure"; error?: ErrorInfo };

export type InMemoryGitGatewayState = {
	currentBranch?: FakeCurrentBranchState;
	repoRoot?: FakeRepoRootState;
};

export type GitCall = {
	cwd: string;
};

export class InMemoryGitGateway implements GitGateway {
	private readonly currentBranchState: FakeCurrentBranchState;
	private readonly repoRootState: FakeRepoRootState;
	private readonly currentBranchLog: GitCall[] = [];
	private readonly repoRootLog: GitCall[] = [];

	constructor(state: InMemoryGitGatewayState = {}) {
		this.currentBranchState = state.currentBranch ?? "feature/demo";
		this.repoRootState = state.repoRoot ?? "/repo";
	}

	get currentBranchCalls(): readonly GitCall[] {
		return this.currentBranchLog.map((call) => ({ ...call }));
	}

	get repoRootCalls(): readonly GitCall[] {
		return this.repoRootLog.map((call) => ({ ...call }));
	}

	async currentBranch(params: { cwd: string }): Promise<GatewayResult<string>> {
		this.currentBranchLog.push({ cwd: params.cwd });
		if (typeof this.currentBranchState === "string") {
			const branch = nonBlank(this.currentBranchState);
			if (branch === undefined) {
				return err(detachedHeadError());
			}
			return ok(branch);
		}

		if (this.currentBranchState.kind === "detached") {
			return err(detachedHeadError());
		}

		return err(this.currentBranchState.error ?? { code: "branch_unresolved", message: "Could not resolve the current git branch." });
	}

	async repoRoot(params: { cwd: string }): Promise<GatewayResult<string>> {
		this.repoRootLog.push({ cwd: params.cwd });
		if (typeof this.repoRootState === "string") {
			const repoRoot = nonBlank(this.repoRootState);
			if (repoRoot === undefined) {
				return err({ code: "repo_root_unresolved", message: "Git repository root command returned no path." });
			}
			return ok(repoRoot);
		}

		return err(this.repoRootState.error ?? { code: "repo_root_unresolved", message: "Could not resolve the git repository root." });
	}
}

export type FakeVercelDeploymentRecord = {
	project: string;
	scope: string;
	environment: "preview" | "production";
	url: string;
	state: string;
	createdAt: number;
	readyAt?: number;
	meta: Record<string, string>;
	inspection: InspectedDeployment;
};

export type InMemoryVercelDeploymentGatewayState = {
	deployments?: readonly FakeVercelDeploymentRecord[];
	available?: boolean;
	listFailure?: ErrorInfo;
	inspectFailure?: ErrorInfo;
};

export type VercelListCall = {
	project: string;
	scope: string;
	branch: string;
	cwd: string;
};

export type VercelInspectCall = {
	url: string;
	scope: string;
	cwd: string;
};

export class InMemoryVercelDeploymentGateway implements VercelDeploymentGateway {
	private readonly deployments: FakeVercelDeploymentRecord[];
	private readonly available: boolean;
	private readonly listFailure: ErrorInfo | undefined;
	private readonly inspectFailure: ErrorInfo | undefined;
	private readonly listLog: VercelListCall[] = [];
	private readonly inspectLog: VercelInspectCall[] = [];

	constructor(state: InMemoryVercelDeploymentGatewayState = {}) {
		this.deployments = [...(state.deployments ?? [])].map(copyRecord);
		this.available = state.available ?? true;
		this.listFailure = state.listFailure;
		this.inspectFailure = state.inspectFailure;
	}

	get listCalls(): readonly VercelListCall[] {
		return this.listLog.map((call) => ({ ...call }));
	}

	get inspectCalls(): readonly VercelInspectCall[] {
		return this.inspectLog.map((call) => ({ ...call }));
	}

	async listReadyPreviewDeployments(params: {
		project: string;
		scope: string;
		branch: string;
		cwd: string;
	}): Promise<GatewayResult<DeploymentCandidate[]>> {
		this.listLog.push({ project: params.project, scope: params.scope, branch: params.branch, cwd: params.cwd });
		if (!this.available) {
			return err(vercelUnavailableError());
		}
		if (this.listFailure !== undefined) {
			return err(this.listFailure);
		}

		const candidates = this.deployments
			.filter((deployment) => deployment.project === params.project)
			.filter((deployment) => deployment.scope === params.scope)
			.filter((deployment) => deployment.environment === "preview")
			.filter((deployment) => deployment.state === "READY")
			.filter((deployment) => deployment.meta.githubCommitRef === params.branch)
			.map(toCandidate);
		return ok(candidates);
	}

	async inspectDeployment(params: { url: string; scope: string; cwd: string }): Promise<GatewayResult<InspectedDeployment>> {
		this.inspectLog.push({ url: params.url, scope: params.scope, cwd: params.cwd });
		if (!this.available) {
			return err(vercelUnavailableError());
		}
		if (this.inspectFailure !== undefined) {
			return err(this.inspectFailure);
		}

		const requestedUrl = normalizeUrl(params.url);
		const found = this.deployments.find(
			(deployment) =>
				deployment.scope === params.scope &&
				(normalizeUrl(deployment.url) === requestedUrl || normalizeUrl(deployment.inspection.url) === requestedUrl),
		);
		if (found === undefined) {
			return err({ code: "vercel_inspect_not_found", message: `No fake Vercel deployment found for ${params.url}.` });
		}

		return ok(copyInspection(found.inspection));
	}
}

export class InMemoryVercelProjectConfigStore implements VercelProjectConfigStore {
	private readonly result: ProjectConfigReadResult;
	private readonly readLog: { repoRoot: string }[] = [];

	constructor(result: ProjectConfigReadResult = { kind: "missing" }) {
		this.result = copyProjectConfigResult(result);
	}

	get readProjectConfigCalls(): readonly { repoRoot: string }[] {
		return this.readLog.map((call) => ({ ...call }));
	}

	async readProjectConfig(params: { repoRoot: string }): Promise<ProjectConfigReadResult> {
		this.readLog.push({ repoRoot: params.repoRoot });
		return copyProjectConfigResult(this.result);
	}
}

export type InMemoryContextState = {
	git?: InMemoryGitGatewayState;
	vercel?: InMemoryVercelDeploymentGatewayState;
	projectConfig?: ProjectConfigReadResult;
};

export function inMemoryContext(state: InMemoryContextState = {}): {
	context: AsdlDevContext;
	git: InMemoryGitGateway;
	vercel: InMemoryVercelDeploymentGateway;
	projectConfig: InMemoryVercelProjectConfigStore;
} {
	const git = new InMemoryGitGateway(state.git);
	const vercel = new InMemoryVercelDeploymentGateway(state.vercel);
	const projectConfig = new InMemoryVercelProjectConfigStore(state.projectConfig);
	return {
		context: { git, vercel, projectConfig },
		git,
		vercel,
		projectConfig,
	};
}

function toCandidate(record: FakeVercelDeploymentRecord): DeploymentCandidate {
	const candidate: DeploymentCandidate = {
		url: record.url,
		state: record.state,
		createdAt: record.createdAt,
		meta: { ...record.meta },
	};
	if (record.readyAt !== undefined) {
		candidate.readyAt = record.readyAt;
	}
	return candidate;
}

function copyRecord(record: FakeVercelDeploymentRecord): FakeVercelDeploymentRecord {
	const copy: FakeVercelDeploymentRecord = {
		project: record.project,
		scope: record.scope,
		environment: record.environment,
		url: record.url,
		state: record.state,
		createdAt: record.createdAt,
		meta: { ...record.meta },
		inspection: copyInspection(record.inspection),
	};
	if (record.readyAt !== undefined) {
		copy.readyAt = record.readyAt;
	}
	return copy;
}

function copyInspection(inspection: InspectedDeployment): InspectedDeployment {
	return {
		id: inspection.id,
		url: inspection.url,
		aliases: [...inspection.aliases],
	};
}

function copyProjectConfigResult(result: ProjectConfigReadResult): ProjectConfigReadResult {
	if (result.kind === "found") {
		return { kind: "found", projectName: result.projectName };
	}
	if (result.kind === "read_error") {
		const copy: ProjectConfigReadResult = { kind: "read_error" };
		if (result.message !== undefined) {
			copy.message = result.message;
		}
		return copy;
	}
	return { kind: result.kind };
}

function vercelUnavailableError(): ErrorInfo {
	return {
		code: "vercel_cli_unavailable",
		message: "Neither vercel nor bunx was found on PATH; cannot query Vercel deployments.",
	};
}

function detachedHeadError(): ErrorInfo {
	return {
		code: "detached_head",
		message: "Could not determine current branch; HEAD may be detached. Pass --branch to select a branch explicitly.",
	};
}

function normalizeUrl(value: string): string {
	return value.replace(/^https?:\/\//, "");
}

function nonBlank(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
