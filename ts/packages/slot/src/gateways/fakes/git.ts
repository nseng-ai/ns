import { resolve } from "node:path";

import type { BranchCreateOptions, BranchDeleteOptions, CurrentBranchResult, GitCommandFailure, SlotGitGateway, WorktreeInfo, WorktreeOccupancy } from "../git.ts";

export type FakeSlotGitOperation =
	| { type: "add-detached-worktree"; path: string; ref: string }
	| { type: "remove-worktree"; path: string }
	| { type: "create-branch"; branch: string; startPoint: string; shouldForce: boolean }
	| { type: "delete-local-branch"; branch: string; shouldForce: boolean }
	| { type: "checkout-branch"; path: string; branch: string }
	| { type: "detach-head"; path: string; ref: string };

export interface FakeSlotGitGatewayOptions {
	existingPaths?: readonly string[] | undefined;
	gitCommonDir?: string | null | undefined;
	repositoryRoot?: string | undefined;
	worktrees?: readonly WorktreeInfo[] | undefined;
	branchOccupancies?: readonly WorktreeOccupancy[] | undefined;
	dirtyPaths?: readonly string[] | undefined;
	trunkBranch?: string | undefined;
	localBranches?: readonly string[] | undefined;
	previousBranches?: Readonly<Record<string, string | null>> | undefined;
	currentBranchFailures?: Readonly<Record<string, GitCommandFailure>> | undefined;
	checkoutFailures?: Readonly<Record<string, GitCommandFailure>> | undefined;
	detachFailures?: Readonly<Record<string, GitCommandFailure>> | undefined;
	createBranchFailures?: Readonly<Record<string, GitCommandFailure>> | undefined;
	deleteBranchFailures?: Readonly<Record<string, GitCommandFailure>> | undefined;
}

export class FakeSlotGitGateway implements SlotGitGateway {
	private readonly existingPaths: ReadonlySet<string>;
	private readonly gitCommonDirValue: string | null;
	private readonly repositoryRootValue: string;
	private readonly worktrees: WorktreeInfo[];
	private readonly branchOccupancies: WorktreeOccupancy[];
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly trunkBranch: string;
	private readonly localBranches: Set<string>;
	private readonly previousBranches: Map<string, string | null>;
	private readonly currentBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly checkoutFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly detachFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly createBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly deleteBranchFailures: Readonly<Record<string, GitCommandFailure>>;
	private readonly log: FakeSlotGitOperation[] = [];

	constructor(options: FakeSlotGitGatewayOptions = {}) {
		this.existingPaths = new Set(options.existingPaths ?? ["/repo"]);
		this.gitCommonDirValue = options.gitCommonDir === undefined ? "/repo/.git" : options.gitCommonDir;
		this.repositoryRootValue = options.repositoryRoot ?? "/repo";
		this.worktrees = (options.worktrees ?? [{ path: "/repo", branch: "master" }]).map(copyWorktree);
		this.branchOccupancies = (options.branchOccupancies ?? this.worktrees.flatMap((worktree) => worktree.branch === null ? [] : [{ path: worktree.path, branch: worktree.branch, operation: "checked-out" }])).map(copyOccupancy);
		this.dirtyPaths = new Set(options.dirtyPaths ?? []);
		this.trunkBranch = options.trunkBranch ?? "master";
		this.localBranches = new Set(options.localBranches ?? deriveLocalBranches(this.worktrees, this.trunkBranch));
		this.previousBranches = new Map(Object.entries(options.previousBranches ?? {}));
		this.currentBranchFailures = options.currentBranchFailures ?? {};
		this.checkoutFailures = options.checkoutFailures ?? {};
		this.detachFailures = options.detachFailures ?? {};
		this.createBranchFailures = options.createBranchFailures ?? {};
		this.deleteBranchFailures = options.deleteBranchFailures ?? {};
	}

	async pathExists(path: string): Promise<boolean> {
		const normalized = resolve(path);
		return this.existingPaths.has(path) || this.existingPaths.has(normalized) || this.worktrees.some((worktree) => resolve(worktree.path) === normalized);
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

	async hasUncommittedChanges(path: string): Promise<boolean> {
		return this.dirtyPaths.has(path);
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

	async createBranch(branch: string, startPoint: string, options: BranchCreateOptions): Promise<GitCommandFailure | null> {
		this.log.push({ type: "create-branch", branch, startPoint, shouldForce: options.shouldForce });
		const failure = this.createBranchFailures[branch];
		if (failure !== undefined) return { ...failure };
		this.localBranches.add(branch);
		return null;
	}

	async deleteLocalBranch(branch: string, options: BranchDeleteOptions): Promise<GitCommandFailure | null> {
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

function copyWorktree(worktree: WorktreeInfo): WorktreeInfo {
	return { path: worktree.path, branch: worktree.branch };
}

function copyOccupancy(occupancy: WorktreeOccupancy): WorktreeOccupancy {
	return { path: occupancy.path, branch: occupancy.branch, operation: occupancy.operation };
}

function deriveLocalBranches(worktrees: readonly WorktreeInfo[], trunkBranch: string): readonly string[] {
	const branches = new Set<string>([trunkBranch]);
	for (const worktree of worktrees) {
		if (worktree.branch !== null) branches.add(worktree.branch);
	}
	return [...branches];
}
