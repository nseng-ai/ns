import type { GitGateway } from "../../src/git.ts";

export interface FakeGitState {
	repoRoot: string;
	currentBranch: string;
	currentCommit: string;
	remotes: Record<string, string>;
	isClean: boolean;
	diffPatch: string;
	hasChanges: boolean;
}

export class FakeGitGateway implements GitGateway {
	private state: FakeGitState;
	private readonly checkoutHistory: string[] = [];
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

	async repoRoot(): Promise<string> {
		return this.state.repoRoot;
	}

	async currentBranch(): Promise<string> {
		return this.state.currentBranch;
	}

	async currentCommit(): Promise<string> {
		return this.state.currentCommit;
	}

	async remotes(): Promise<Record<string, string>> {
		return { ...this.state.remotes };
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

	async checkout(branch: string): Promise<void> {
		this.checkoutHistory.push(branch);
		this.state.currentBranch = branch;
	}

	getCheckoutHistory(): readonly string[] {
		return [...this.checkoutHistory];
	}

	getCreatedBranches(): readonly string[] {
		return [...this.createdBranches];
	}

	// Test helpers to mutate state
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
