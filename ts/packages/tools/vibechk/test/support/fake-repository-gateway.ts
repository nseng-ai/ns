import type { GitProvenance } from "../../src/models.ts";
import type { VibechkWorkdirGateway } from "../../src/repository.ts";

export interface FakeGitState {
	repoRoot: string;
	currentBranch: string;
	currentCommit: string;
	remotes: Record<string, string>;
	isClean: boolean;
	diffPatch: string;
	hasChanges: boolean;
}

export class FakeVibechkWorkdirGateway implements VibechkWorkdirGateway {
	private state: FakeGitState;
	private readonly restoreHistory: string[] = [];
	private readonly createdBranches: string[] = [];

	constructor(state: Partial<FakeGitState> = {}) {
		this.state = {
			repoRoot: state.repoRoot ?? "/tmp/repo",
			currentBranch: state.currentBranch ?? "main",
			currentCommit: state.currentCommit ?? "abc123def456",
			remotes: state.remotes ?? {},
			isClean: state.isClean ?? true,
			diffPatch: state.diffPatch ?? "",
			hasChanges: state.hasChanges ?? false,
		};
	}

	async readProvenance(): Promise<GitProvenance> {
		return {
			repoRoot: this.state.repoRoot,
			startingBranch: this.state.currentBranch,
			startingCommit: this.state.currentCommit,
			remotes: { ...this.state.remotes },
		};
	}

	async isClean(): Promise<boolean> {
		return this.state.isClean;
	}

	async diffPatch(): Promise<string> {
		return this.state.diffPatch;
	}

	async hasChanges(): Promise<boolean> {
		return this.state.hasChanges;
	}

	async createResultBranchAndCommit(branch: string, _message: string): Promise<void> {
		this.createdBranches.push(branch);
		this.state.currentBranch = branch;
		this.state.isClean = true;
		this.state.hasChanges = false;
	}

	async restoreBranch(branch: string): Promise<void> {
		this.restoreHistory.push(branch);
		this.state.currentBranch = branch;
	}

	getRestoreHistory(): readonly string[] {
		return [...this.restoreHistory];
	}

	getCreatedBranches(): readonly string[] {
		return [...this.createdBranches];
	}

	setDiffPatch(diff: string): void {
		this.state.diffPatch = diff;
	}

	setHasChanges(hasChanges: boolean): void {
		this.state.hasChanges = hasChanges;
	}

	setIsClean(isClean: boolean): void {
		this.state.isClean = isClean;
	}
}
