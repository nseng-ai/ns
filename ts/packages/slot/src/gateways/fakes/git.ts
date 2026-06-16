import { resolve } from "node:path";

import type { SlotGitGateway, WorktreeInfo, WorktreeOccupancy } from "../git.ts";

export type FakeSlotGitOperation =
	| { type: "add-detached-worktree"; path: string; ref: string }
	| { type: "remove-worktree"; path: string };

export interface FakeSlotGitGatewayOptions {
	existingPaths?: readonly string[] | undefined;
	gitCommonDir?: string | null | undefined;
	repositoryRoot?: string | undefined;
	worktrees?: readonly WorktreeInfo[] | undefined;
	branchOccupancies?: readonly WorktreeOccupancy[] | undefined;
	dirtyPaths?: readonly string[] | undefined;
	trunkBranch?: string | undefined;
}

export class FakeSlotGitGateway implements SlotGitGateway {
	private readonly existingPaths: ReadonlySet<string>;
	private readonly gitCommonDirValue: string | null;
	private readonly repositoryRootValue: string;
	private readonly worktrees: WorktreeInfo[];
	private readonly branchOccupancies: WorktreeOccupancy[];
	private readonly dirtyPaths: ReadonlySet<string>;
	private readonly trunkBranch: string;
	private readonly log: FakeSlotGitOperation[] = [];

	constructor(options: FakeSlotGitGatewayOptions = {}) {
		this.existingPaths = new Set(options.existingPaths ?? ["/repo"]);
		this.gitCommonDirValue = options.gitCommonDir === undefined ? "/repo/.git" : options.gitCommonDir;
		this.repositoryRootValue = options.repositoryRoot ?? "/repo";
		this.worktrees = (options.worktrees ?? [{ path: "/repo", branch: "master" }]).map(copyWorktree);
		this.branchOccupancies = (options.branchOccupancies ?? this.worktrees.flatMap((worktree) => worktree.branch === null ? [] : [{ path: worktree.path, branch: worktree.branch, operation: "checked-out" }])).map(copyOccupancy);
		this.dirtyPaths = new Set(options.dirtyPaths ?? []);
		this.trunkBranch = options.trunkBranch ?? "master";
	}

	async pathExists(path: string): Promise<boolean> {
		return this.existingPaths.has(path) || this.existingPaths.has(resolve(path));
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

	async addDetachedWorktree(path: string, ref: string): Promise<void> {
		this.log.push({ type: "add-detached-worktree", path, ref });
		this.worktrees.push({ path, branch: null });
	}

	async removeWorktree(path: string): Promise<void> {
		this.log.push({ type: "remove-worktree", path });
		const index = this.worktrees.findIndex((worktree) => worktree.path === path);
		if (index !== -1) this.worktrees.splice(index, 1);
	}

	operations(): readonly FakeSlotGitOperation[] {
		return this.log.map((operation) => ({ ...operation }));
	}
}

function copyWorktree(worktree: WorktreeInfo): WorktreeInfo {
	return { path: worktree.path, branch: worktree.branch };
}

function copyOccupancy(occupancy: WorktreeOccupancy): WorktreeOccupancy {
	return { path: occupancy.path, branch: occupancy.branch, operation: occupancy.operation };
}
