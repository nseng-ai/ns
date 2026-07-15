import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	createProductionSourceWorkspaceGateway,
	type ProductionWorkspaceAdapterOperations,
} from "../../src/deployability/real-production-deployment-gateways.ts";

const COMMIT_SHA = "0123456789abcdef0123456789abcdef01234567";
const REPOSITORY_ROOT = "/operator/repo";
const PACKAGE_ROOT = "/operator/repo/ts/packages/capabilities/vercel";
const TEMPORARY_PARENT = "/temporary/production";
const WORKTREE_ROOT = join(TEMPORARY_PARENT, "source");
const DETACHED_PACKAGE_ROOT = join(WORKTREE_ROOT, "ts/packages/capabilities/vercel");

interface FakeProductionWorkspaceState {
	readonly hasEnvironment?: boolean;
	readonly installationSucceeds?: boolean;
	readonly headSha?: string;
	readonly status?: string;
}

interface CommandCall {
	readonly commandName: string;
	readonly args: readonly string[];
	readonly cwd: string;
}

class FakeProductionWorkspaceOperations implements ProductionWorkspaceAdapterOperations {
	readonly commandCalls: CommandCall[] = [];
	readonly madeDirectories: string[] = [];
	readonly copiedFiles: Array<{ readonly source: string; readonly destination: string }> = [];
	readonly removedTrees: string[] = [];
	readonly promotions: Array<{ readonly repositoryRoot: string; readonly packageRoot: string }> =
		[];
	private readonly state: FakeProductionWorkspaceState;

	constructor(state: FakeProductionWorkspaceState = {}) {
		this.state = state;
	}

	async createTemporaryParent(): Promise<string> {
		return TEMPORARY_PARENT;
	}

	async runCommand(options: {
		readonly commandName: string;
		readonly args: readonly string[];
		readonly cwd: string;
	}): Promise<{ readonly ok: boolean; readonly stdout: string }> {
		const { commandName, args, cwd } = options;
		this.commandCalls.push({ commandName, args: [...args], cwd });
		if (commandName === "corepack" && args.includes("install")) {
			return { ok: this.state.installationSucceeds ?? true, stdout: "" };
		}
		if (commandName === "git" && args[0] === "rev-parse") {
			return { ok: true, stdout: `${this.state.headSha ?? COMMIT_SHA}\n` };
		}
		if (commandName === "git" && args[0] === "status") {
			return { ok: true, stdout: this.state.status ?? "" };
		}
		return { ok: true, stdout: "" };
	}

	async makeDirectory(path: string): Promise<void> {
		this.madeDirectories.push(path);
	}

	async copyFile(source: string, destination: string): Promise<void> {
		this.copiedFiles.push({ source, destination });
	}

	async readText(): Promise<string> {
		return JSON.stringify({
			projectId: "prj_example",
			orgId: "team_example",
			projectName: "ns-dispatch",
		});
	}

	async pathExists(path: string): Promise<boolean> {
		return path === join(PACKAGE_ROOT, ".env.local") && (this.state.hasEnvironment ?? false);
	}

	async removeTree(path: string): Promise<void> {
		this.removedTrees.push(path);
	}

	async promoteBuildOutput(options: {
		readonly repositoryRoot: string;
		readonly packageRoot: string;
	}): Promise<{ readonly ok: true; readonly artifactDigest: string }> {
		this.promotions.push(options);
		return { ok: true, artifactDigest: `sha256:${"a".repeat(64)}` };
	}
}

function createGateway(operations: ProductionWorkspaceAdapterOperations) {
	return createProductionSourceWorkspaceGateway(
		{
			repositoryRoot: REPOSITORY_ROOT,
			packageRoot: PACKAGE_ROOT,
			writeDiagnostic() {},
		},
		operations,
	);
}

describe("real detached production workspace adapter", () => {
	it("builds, revalidates, promotes, and disposes from the detached source", async () => {
		const operations = new FakeProductionWorkspaceOperations({ hasEnvironment: true });
		const prepared = await createGateway(operations).prepareSourceWorkspace(COMMIT_SHA);
		expect(prepared.ok).toBe(true);
		if (!prepared.ok) return;

		await expect(prepared.workspace.buildPackageDeployable()).resolves.toEqual({ ok: true });
		await expect(prepared.workspace.verifySourceAfterBuild()).resolves.toEqual({ ok: true });
		await expect(prepared.workspace.readPackageProjectIdentity()).resolves.toEqual({
			ok: true,
			value: {
				projectId: "prj_example",
				teamId: "team_example",
				projectName: "ns-dispatch",
			},
		});
		await expect(prepared.workspace.promoteVerifiedBuildOutput()).resolves.toEqual({
			ok: true,
			artifactDigest: `sha256:${"a".repeat(64)}`,
		});
		await expect(prepared.workspace.dispose()).resolves.toEqual({ ok: true });

		expect(operations.madeDirectories).toEqual([join(DETACHED_PACKAGE_ROOT, ".vercel")]);
		expect(operations.copiedFiles).toEqual([
			{
				source: join(PACKAGE_ROOT, ".vercel/project.json"),
				destination: join(DETACHED_PACKAGE_ROOT, ".vercel/project.json"),
			},
			{
				source: join(PACKAGE_ROOT, ".env.local"),
				destination: join(DETACHED_PACKAGE_ROOT, ".env.local"),
			},
		]);
		expect(operations.commandCalls).toEqual([
			{
				commandName: "git",
				args: ["worktree", "add", "--detach", WORKTREE_ROOT, COMMIT_SHA],
				cwd: REPOSITORY_ROOT,
			},
			{
				commandName: "corepack",
				args: ["pnpm", "--filter", "@nseng-ai/vercel...", "install", "--frozen-lockfile"],
				cwd: join(WORKTREE_ROOT, "ts"),
			},
			{
				commandName: "corepack",
				args: ["pnpm", "run", "build:deployable"],
				cwd: DETACHED_PACKAGE_ROOT,
			},
			{
				commandName: "git",
				args: ["rev-parse", "HEAD"],
				cwd: WORKTREE_ROOT,
			},
			{
				commandName: "git",
				args: ["status", "--porcelain=v1", "--untracked-files=all"],
				cwd: WORKTREE_ROOT,
			},
			{
				commandName: "git",
				args: ["worktree", "remove", "--force", WORKTREE_ROOT],
				cwd: REPOSITORY_ROOT,
			},
		]);
		expect(operations.promotions).toEqual([
			{ repositoryRoot: REPOSITORY_ROOT, packageRoot: DETACHED_PACKAGE_ROOT },
		]);
		expect(operations.removedTrees).toEqual([TEMPORARY_PARENT]);
	});

	it("omits the optional environment copy when it is absent", async () => {
		const operations = new FakeProductionWorkspaceOperations();
		const prepared = await createGateway(operations).prepareSourceWorkspace(COMMIT_SHA);
		expect(prepared.ok).toBe(true);
		if (!prepared.ok) return;

		expect(operations.copiedFiles).toEqual([
			{
				source: join(PACKAGE_ROOT, ".vercel/project.json"),
				destination: join(DETACHED_PACKAGE_ROOT, ".vercel/project.json"),
			},
		]);
		await prepared.workspace.dispose();
	});

	it("removes the detached worktree and temporary parent when preparation fails", async () => {
		const operations = new FakeProductionWorkspaceOperations({ installationSucceeds: false });

		await expect(createGateway(operations).prepareSourceWorkspace(COMMIT_SHA)).resolves.toEqual({
			ok: false,
			message: "Cannot install the locked production workspace graph.",
		});
		expect(operations.commandCalls.at(-1)).toEqual({
			commandName: "git",
			args: ["worktree", "remove", "--force", WORKTREE_ROOT],
			cwd: REPOSITORY_ROOT,
		});
		expect(operations.removedTrees).toEqual([TEMPORARY_PARENT]);
	});
});
