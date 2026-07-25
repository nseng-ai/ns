import { resolve } from "node:path";

import type {
	BranchComparison,
	BranchComparisonResult,
	BranchCreateOptions,
	BranchDeleteOptions,
	CurrentBranchResult,
	GitCommandFailure,
	LocalBranchesResult,
	LocalBranchTip,
	SlotRepositoryGateway,
	UncommittedChangesResult,
	WorktreeInfo,
	WorktreeOccupancy,
} from "../repository.ts";

export type FakeSlotGitOperation =
	| { type: "read-branch-comparison"; parent: string; branch: string }
	| { type: "add-detached-worktree"; path: string; ref: string }
	| { type: "remove-worktree"; path: string }
	| { type: "create-branch"; branch: string; startPoint: string; shouldForce: boolean }
	| { type: "delete-local-branch"; branch: string; shouldForce: boolean }
	| { type: "checkout-branch"; path: string; branch: string }
	| { type: "detach-head"; path: string; ref: string };

export interface FakeBranchComparisonFixture {
	parent: string;
	branch: string;
	comparison: BranchComparison;
}

export interface FakeBranchComparisonFailureFixture {
	parent: string;
	branch: string;
	message: string;
}

export interface FakeSlotRepositoryGatewayOptions {
	existingPaths?: readonly string[];
	gitCommonDir?: string | null;
	repositoryRoot?: string;
	worktrees?: readonly WorktreeInfo[];
	branchOccupancies?: readonly WorktreeOccupancy[];
	dirtyPaths?: readonly string[];
	uncommittedChangesFailure?: GitCommandFailure;
	trunkBranch?: string;
	localBranches?: readonly string[];
	localBranchesFailure?: GitCommandFailure;
	localBranchTips?: readonly LocalBranchTip[];
	previousBranches?: Readonly<Record<string, string | null>>;
	currentBranchFailures?: Readonly<Record<string, GitCommandFailure>>;
	checkoutFailures?: Readonly<Record<string, GitCommandFailure>>;
	detachFailures?: Readonly<Record<string, GitCommandFailure>>;
	createBranchFailures?: Readonly<Record<string, GitCommandFailure>>;
	deleteBranchFailures?: Readonly<Record<string, GitCommandFailure>>;
	branchComparisons?: readonly FakeBranchComparisonFixture[];
	branchComparisonFailures?: readonly FakeBranchComparisonFailureFixture[];
}

export class FakeSlotRepositoryGateway implements SlotRepositoryGateway {
	private readonly existingPaths: ReadonlySet<string>;
	private readonly gitCommonDirValue: string | null;
	private readonly repositoryRootValue: string;
	private readonly worktrees: WorktreeInfo[];
	private readonly branchOccupancies: WorktreeOccupancy[];
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly uncommittedChangesFailure: GitCommandFailure | undefined;
	private readonly trunkBranch: string;
	private readonly localBranches: Set<string>;
	private readonly localBranchesFailure: GitCommandFailure | undefined;
	private readonly localBranchTips: LocalBranchTip[];
	private readonly previousBranches: Map<string, string | null>;
	private readonly currentBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly checkoutFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly detachFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly createBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly deleteBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly branchComparisons: ReadonlyMap<string, BranchComparison>;
	private readonly branchComparisonFailures: ReadonlyMap<string, GitCommandFailure>;
	private readonly log: FakeSlotGitOperation[] = [];

	constructor(options: FakeSlotRepositoryGatewayOptions = {}) {
		this.existingPaths = new Set(options.existingPaths ?? ["/repo"]);
		this.gitCommonDirValue =
			options.gitCommonDir === undefined ? "/repo/.git" : options.gitCommonDir;
		this.repositoryRootValue = options.repositoryRoot ?? "/repo";
		this.worktrees = (options.worktrees ?? [{ path: "/repo", branch: "master" }]).map(copyWorktree);
		this.branchOccupancies = (
			options.branchOccupancies ??
			this.worktrees.flatMap((worktree) =>
				worktree.branch === null
					? []
					: [{ path: worktree.path, branch: worktree.branch, operation: "checked-out" }],
			)
		).map(copyOccupancy);
		this.dirtyPaths = new Set(options.dirtyPaths ?? []);
		this.uncommittedChangesFailure = options.uncommittedChangesFailure;
		this.trunkBranch = options.trunkBranch ?? "master";
		this.localBranches = new Set(
			options.localBranches ?? deriveLocalBranches(this.worktrees, this.trunkBranch),
		);
		this.localBranchesFailure = options.localBranchesFailure;
		this.localBranchTips = (
			options.localBranchTips ?? [...this.localBranches].map((name) => ({ name, headIso: null }))
		).map(copyLocalBranchTip);
		this.previousBranches = new Map(Object.entries(options.previousBranches ?? {}));
		this.currentBranchFailures = options.currentBranchFailures ?? {};
		this.checkoutFailures = options.checkoutFailures ?? {};
		this.detachFailures = options.detachFailures ?? {};
		this.createBranchFailures = options.createBranchFailures ?? {};
		this.deleteBranchFailures = options.deleteBranchFailures ?? {};
		this.branchComparisons = new Map(
			(options.branchComparisons ?? []).map((fixture) => [
				branchComparisonKey(fixture.parent, fixture.branch),
				copyBranchComparison(fixture.comparison),
			]),
		);
		this.branchComparisonFailures = new Map(
			(options.branchComparisonFailures ?? []).map((fixture) => [
				branchComparisonKey(fixture.parent, fixture.branch),
				{ message: fixture.message },
			]),
		);
	}

	async pathExists(path: string): Promise<boolean> {
		const normalized = resolve(path);
		return (
			this.existingPaths.has(path) ||
			this.existingPaths.has(normalized) ||
			this.worktrees.some((worktree) => resolve(worktree.path) === normalized)
		);
	}

	async getGitCommonDir(_cwd: string): Promise<string | null> {
		return this.gitCommonDirValue;
	}

	async getRepositoryRoot(_cwd: string): Promise<string> {
		return this.repositoryRootValue;
	}

	async listWorktrees(): Promise<readonly WorktreeInfo[]> {
		return this.worktrees.map(copyWorktree);
	}

	async listBranchOccupancies(): Promise<readonly WorktreeOccupancy[]> {
		return this.branchOccupancies.map(copyOccupancy);
	}

	async listLocalBranches(): Promise<LocalBranchesResult> {
		if (this.localBranchesFailure !== undefined)
			return { type: "failure", failure: { ...this.localBranchesFailure } };
		return { type: "ok", branches: [...this.localBranches] };
	}

	async listLocalBranchTips(): Promise<readonly LocalBranchTip[]> {
		return this.localBranchTips.map(copyLocalBranchTip);
	}

	async hasUncommittedChanges(path: string): Promise<UncommittedChangesResult> {
		if (this.uncommittedChangesFailure !== undefined)
			return { type: "failure", failure: { ...this.uncommittedChangesFailure } };
		return { type: "ok", hasUncommittedChanges: this.dirtyPaths.has(path) };
	}

	async getTrunkBranch(): Promise<string> {
		return this.trunkBranch;
	}

	async getCurrentBranch(cwd: string): Promise<CurrentBranchResult> {
		const failure = this.currentBranchFailures[cwd];
		if (failure !== undefined) return { type: "failure", failure: { ...failure } };
		const worktree = this.worktrees.find((candidate) => candidate.path === cwd) ?? null;
		if (worktree?.branch === undefined || worktree.branch === null) return { type: "detached" };
		return { type: "branch", branch: worktree.branch };
	}

	async getPreviousBranch(cwd: string): Promise<string | null> {
		return this.previousBranches.get(cwd) ?? null;
	}

	async branchExists(branch: string): Promise<boolean> {
		return this.localBranches.has(branch);
	}

	async readBranchComparison(options: {
		parent: string;
		branch: string;
	}): Promise<BranchComparisonResult> {
		this.log.push({ type: "read-branch-comparison", ...options });
		const key = branchComparisonKey(options.parent, options.branch);
		const comparisonFailure = this.branchComparisonFailures.get(key);
		if (comparisonFailure !== undefined)
			return { type: "failure", failure: { ...comparisonFailure } };
		const missingRefs = [options.parent, options.branch].filter(
			(ref) => !this.localBranches.has(ref),
		);
		if (missingRefs.length > 0)
			return {
				type: "failure",
				failure: { message: `Local branch ref(s) not found: ${missingRefs.join(", ")}` },
			};
		const comparison = this.branchComparisons.get(key) ?? emptyBranchComparison();
		return { type: "ok", comparison: copyBranchComparison(comparison) };
	}

	async createBranch(
		branch: string,
		startPoint: string,
		options: BranchCreateOptions,
	): Promise<GitCommandFailure | null> {
		this.log.push({ type: "create-branch", branch, startPoint, shouldForce: options.shouldForce });
		const failure = this.createBranchFailures[branch];
		if (failure !== undefined) return { ...failure };
		this.localBranches.add(branch);
		return null;
	}

	async deleteLocalBranch(
		branch: string,
		options: BranchDeleteOptions,
	): Promise<GitCommandFailure | null> {
		this.log.push({ type: "delete-local-branch", branch, shouldForce: options.shouldForce });
		const failure = this.deleteBranchFailures[branch];
		if (failure !== undefined) return { ...failure };
		if (!this.localBranches.has(branch)) return { message: `error: branch '${branch}' not found` };
		this.localBranches.delete(branch);
		return null;
	}

	async checkoutBranch(path: string, branch: string): Promise<GitCommandFailure | null> {
		this.log.push({ type: "checkout-branch", path, branch });
		const failure = this.checkoutFailures[path] ?? this.checkoutFailures[`${path}:${branch}`];
		if (failure !== undefined) return { ...failure };
		const worktree = this.ensureWorktree(path);
		this.previousBranches.set(path, worktree.branch);
		worktree.branch = branch;
		this.localBranches.add(branch);
		this.setCheckedOutOccupancy(path, branch);
		return null;
	}

	async detachHead(path: string, ref: string): Promise<GitCommandFailure | null> {
		this.log.push({ type: "detach-head", path, ref });
		const failure = this.detachFailures[path] ?? this.detachFailures[`${path}:${ref}`];
		if (failure !== undefined) return { ...failure };
		const worktree = this.ensureWorktree(path);
		this.previousBranches.set(path, worktree.branch);
		worktree.branch = null;
		this.removeOccupancyAt(path);
		return null;
	}

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		this.log.push({ type: "add-detached-worktree", path, ref });
		this.worktrees.push({ path, branch: null });
	}

	async removeWorktree(path: string): Promise<void> {
		this.log.push({ type: "remove-worktree", path });
		const index = this.worktrees.findIndex((worktree) => worktree.path === path);
		if (index !== -1) this.worktrees.splice(index, 1);
		this.removeOccupancyAt(path);
	}

	operations(): readonly FakeSlotGitOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}

	private ensureWorktree(path: string): WorktreeInfo {
		let worktree = this.worktrees.find((candidate) => candidate.path === path);
		if (worktree === undefined) {
			worktree = { path, branch: null };
			this.worktrees.push(worktree);
		}
		return worktree;
	}

	private removeOccupancyAt(path: string): void {
		const index = this.branchOccupancies.findIndex((occupancy) => occupancy.path === path);
		if (index !== -1) this.branchOccupancies.splice(index, 1);
	}

	private setCheckedOutOccupancy(path: string, branch: string): void {
		this.removeOccupancyAt(path);
		this.branchOccupancies.push({ path, branch, operation: "checked-out" });
	}
}

function branchComparisonKey(parent: string, branch: string): string {
	return `${parent}\0${branch}`;
}

function emptyBranchComparison(): BranchComparison {
	return {
		commits: [],
		diff: { filesChanged: 0, insertions: 0, deletions: 0, files: [] },
	};
}

function copyBranchComparison(comparison: BranchComparison): BranchComparison {
	return {
		commits: comparison.commits.map((commit) => ({ ...commit })),
		diff: { ...comparison.diff, files: comparison.diff.files.map((file) => ({ ...file })) },
	};
}

function copyWorktree(worktree: WorktreeInfo): WorktreeInfo {
	return { path: worktree.path, branch: worktree.branch };
}

function copyOccupancy(occupancy: WorktreeOccupancy): WorktreeOccupancy {
	return { path: occupancy.path, branch: occupancy.branch, operation: occupancy.operation };
}

function copyLocalBranchTip(tip: LocalBranchTip): LocalBranchTip {
	return { name: tip.name, headIso: tip.headIso };
}

function deriveLocalBranches(
	worktrees: readonly WorktreeInfo[],
	trunkBranch: string,
): readonly string[] {
	const branches = new Set<string>([trunkBranch]);
	for (const worktree of worktrees) {
		if (worktree.branch !== null) branches.add(worktree.branch);
	}
	return [...branches];
}
