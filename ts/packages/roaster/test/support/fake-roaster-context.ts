import type { CommandExecApi, ExecOptions, ExecResult } from "@asdl/core/exec";
import type { GitBranchParams, GitBranchPresenceResult, GitGateway, GitOperationResult, GitOptionalResult, GitResult } from "@asdl/core/git";

import type { RoasterContext } from "../../src/context.ts";
import { FakeRoasterGitHubGateway, type RoasterGitHubGateway } from "../../src/gateways/github.ts";
import { FakeLocalDiffGateway, type LocalDiffGateway } from "../../src/gateways/local-diff.ts";
import { FakeReviewCatalogGateway, type ReviewCatalogGateway } from "../../src/gateways/review-catalog.ts";

export interface FakeRoasterContextOptions {
	readonly execApi?: CommandExecApi | undefined;
	readonly gitGateway?: GitGateway | undefined;
	readonly localDiff?: LocalDiffGateway | undefined;
	readonly reviewCatalog?: ReviewCatalogGateway | undefined;
	readonly github?: RoasterGitHubGateway | undefined;
}

export function fakeRoasterContext(options: FakeRoasterContextOptions = {}): RoasterContext {
	const execApi = options.execApi ?? new ScriptedCommandExecApi();
	const gitGateway = options.gitGateway ?? new StaticGitGateway({ repoRoot: "/repo", trunkBranch: "main" });
	return {
		execApi,
		gitGateway,
		localDiff: options.localDiff ?? new FakeLocalDiffGateway(),
		reviewCatalog: options.reviewCatalog ?? new FakeReviewCatalogGateway(),
		github: options.github ?? new FakeRoasterGitHubGateway(),
	};
}

export interface ScriptedCommandCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options?: ExecOptions | undefined;
}

export class ScriptedCommandExecApi implements CommandExecApi {
	private readonly results: ExecResult[];
	private readonly callsInternal: ScriptedCommandCall[] = [];

	constructor(results: readonly Partial<ExecResult>[] = []) {
		this.results = results.map((result) => ({ stdout: "", stderr: "", code: 0, killed: false, ...result }));
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({ command, args: [...args], options });
		return this.results.shift() ?? { stdout: "", stderr: "", code: 0, killed: false };
	}

	calls(): readonly ScriptedCommandCall[] {
		return this.callsInternal.map((call) => ({ ...call, args: [...call.args] }));
	}
}

export interface StaticGitGatewayOptions {
	readonly repoRoot: string;
	readonly trunkBranch?: string | null | undefined;
	readonly repoRootError?: string | undefined;
}

export class StaticGitGateway implements GitGateway {
	private readonly repoRootValue: string;
	private readonly trunkBranchValue: string | null;
	private readonly repoRootError: string | null;

	constructor(options: StaticGitGatewayOptions) {
		this.repoRootValue = options.repoRoot;
		this.trunkBranchValue = options.trunkBranch ?? null;
		this.repoRootError = options.repoRootError ?? null;
	}

	async repoRoot(): Promise<GitResult<string>> {
		if (this.repoRootError !== null) return { ok: false, error: { code: "repo_root_failed", message: this.repoRootError } };
		return { ok: true, value: this.repoRootValue };
	}

	async optionalRepoRoot(): Promise<GitOptionalResult<string>> {
		if (this.repoRootError !== null) return { type: "missing" };
		return { type: "found", value: this.repoRootValue };
	}

	async currentBranch(): Promise<GitResult<string>> {
		return { ok: true, value: "feature" };
	}

	async trunkBranch(): Promise<GitOptionalResult<string>> {
		if (this.trunkBranchValue === null) return { type: "missing" };
		return { type: "found", value: this.trunkBranchValue };
	}

	async originUrl(): Promise<GitOptionalResult<string>> {
		return { type: "found", value: "git@example.com:repo.git" };
	}

	async headCommit(): Promise<GitResult<string>> {
		return { ok: true, value: "abc123" };
	}

	async validateBranchRef(_params: GitBranchParams): Promise<GitOperationResult> {
		return { ok: true };
	}

	async localBranchPresence(params: GitBranchParams): Promise<GitBranchPresenceResult> {
		return { type: "present", refName: `refs/heads/${params.branch}`, displayCommand: "git rev-parse" };
	}

	async createBranchAtHead(_params: GitBranchParams): Promise<GitOperationResult> {
		return { ok: true };
	}
}
