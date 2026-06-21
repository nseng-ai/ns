import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
	NodeCommandExecApi,
	type CommandExecApi,
	type ExecOptions,
	type ExecResult,
} from "@sdl/core/exec";
import type { BrmemResult } from "../../src/contracts.ts";
import type {
	CopyEntriesResult,
	DeleteEntryResult,
	ListedEntry,
	PutEntryResult,
} from "../../src/gateway.ts";
import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { mustSnapshotRef } from "../../src/ref-layout.ts";
import { createTempGitRepo, type TempGitRepo } from "../support/temp-git-repo.ts";

describe("RealGitBrmemGateway integration", () => {
	it("writes Snapshot Refs and reads/checks/lists Entries in a throwaway repository", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await withCommitterDate("2026-02-03T04:05:06+00:00", async () => {
				expect(
					(
						await gateway.putEntry({
							namespace: "base",
							branch: "feat/x",
							key: "body.md",
							content: "hello",
						})
					).type,
				).toBe("ok");
			});
			await withCommitterDate("2026-02-03T04:06:07+00:00", async () => {
				expect(
					(
						await gateway.putEntry({
							namespace: "base",
							branch: "feat/x",
							key: "nested/plan.md",
							content: "nested",
						})
					).type,
				).toBe("ok");
			});
			const read = await gateway.getEntry({ namespace: "base", branch: "feat/x", key: "body.md" });
			expect(read).toMatchObject({ type: "found", value: { content: "hello" } });
			const listed = await gateway.listEntries({ namespace: "base", branch: "feat/x" });
			if (listed.type !== "ok") throw new Error("unexpected list error");
			expect(listed.value.map((entry) => ({ key: entry.key, updatedAt: entry.updatedAt }))).toEqual(
				[
					{ key: "body.md", updatedAt: "2026-02-03T04:05:06+00:00" },
					{ key: "nested/plan.md", updatedAt: "2026-02-03T04:06:07+00:00" },
				],
			);
			const checked = await gateway.checkEntry({
				namespace: "base",
				branch: "feat/x",
				key: "body.md",
			});
			expect(checked).toMatchObject({ type: "found", value: { sizeBytes: 5 } });
			expect(repo.runGit(["show", "refs/brmem/base/feat---x:body.md"])).toBe("hello");
		} finally {
			repo.cleanup();
		}
	});

	it("writes mixed-depth Entry Keys as nested Snapshot tree entries", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "main",
						key: "a/b/c.md",
						content: "C",
					})
				).type,
			).toBe("ok");
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "main",
						key: "a/d.md",
						content: "D",
					})
				).type,
			).toBe("ok");
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "main",
						key: "z.md",
						content: "Z",
					})
				).type,
			).toBe("ok");

			expect(
				repo.runGit(["ls-tree", "-r", "--name-only", "refs/brmem/base/main"]).trim().split("\n"),
			).toEqual(["a/b/c.md", "a/d.md", "z.md"]);
			expect(
				await gateway.getEntry({ namespace: "base", branch: "main", key: "a/b/c.md" }),
			).toMatchObject({ type: "found", value: { content: "C" } });
		} finally {
			repo.cleanup();
		}
	});

	it("does not mutate the main repo index when the exec adapter drops GIT_INDEX_FILE", async () => {
		const repo = createTempGitRepo();
		try {
			const beforeIndexTree = repo.runGit(["write-tree"]).trim();
			const gateway = new RealGitBrmemGateway(
				repo.path,
				new DroppingOptionsCommands({ dropEnv: true }),
			);

			const put = await gateway.putEntry({
				namespace: "branch-context",
				branch: "feat/x",
				key: "plan.md",
				content: "plan body",
			});

			expect(put).toMatchObject({ type: "ok" });
			expect(repo.runGit(["status", "--porcelain"])).toBe("");
			expect(repo.runGit(["write-tree"]).trim()).toBe(beforeIndexTree);
			expect(
				repo.runGit(["ls-tree", "-r", "--name-only", "refs/brmem/ns/branch-context/feat---x"]),
			).toBe("plan.md\n");
		} finally {
			repo.cleanup();
		}
	});

	it("fails safe without advancing refs when the exec adapter drops mktree stdin", async () => {
		const repo = createTempGitRepo();
		try {
			const beforeIndexTree = repo.runGit(["write-tree"]).trim();
			const gateway = new RealGitBrmemGateway(
				repo.path,
				new DroppingOptionsCommands({ dropStdin: true }),
			);

			const put = await gateway.putEntry({
				namespace: "base",
				branch: "main",
				key: "plan.md",
				content: "plan body",
			});

			expect(put).toMatchObject({ type: "error", error: { code: "snapshot_tree_mismatch" } });
			expect(snapshotRefExists(repo, "refs/brmem/base/main")).toBe(false);
			expect(repo.runGit(["status", "--porcelain"])).toBe("");
			expect(repo.runGit(["write-tree"]).trim()).toBe(beforeIndexTree);
		} finally {
			repo.cleanup();
		}
	});

	it("deletes Entries while preserving siblings and leaving an empty Snapshot", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await gateway.putEntry({ namespace: "base", branch: "main", key: "a", content: "A" });
			await gateway.putEntry({ namespace: "base", branch: "main", key: "b", content: "B" });
			expect(
				(await gateway.deleteEntry({ namespace: "base", branch: "main", key: "a" })).type,
			).toBe("ok");
			expect(await gateway.getEntry({ namespace: "base", branch: "main", key: "b" })).toMatchObject(
				{ type: "found" },
			);
			const deletedLast = await gateway.deleteEntry({
				namespace: "base",
				branch: "main",
				key: "b",
			});
			expect(deletedLast).toMatchObject({ type: "ok", value: { isSnapshotEmpty: true } });
			expect(repo.runGit(["rev-parse", "--verify", "refs/brmem/base/main"]).trim()).toMatch(
				/^[0-9a-f]{40}$/u,
			);
			expect(repo.runGit(["ls-tree", "-r", "refs/brmem/base/main"])).toBe("");
		} finally {
			repo.cleanup();
		}
	});

	it("copies snapshots by reassigning the destination ref to the source commit", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await gateway.putEntry({
				namespace: "notes",
				branch: "source",
				key: "body.md",
				content: "source",
			});
			const sourceSha = repo.runGit(["rev-parse", "refs/brmem/ns/notes/source"]).trim();
			const copied = await gateway.copyEntries({
				namespace: "notes",
				fromBranch: "source",
				toBranch: "dest",
				shouldOverwrite: true,
			});
			expect(copied).toMatchObject({ type: "ok" });
			expect(repo.runGit(["rev-parse", "refs/brmem/ns/notes/dest"]).trim()).toBe(sourceSha);
		} finally {
			repo.cleanup();
		}
	});

	it("copies key globs while preserving non-matching destination Entries", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await gateway.putEntry({
				namespace: "base",
				branch: "source",
				key: "foo/body.md",
				content: "source",
			});
			await gateway.putEntry({
				namespace: "base",
				branch: "source",
				key: "foo/sub/x.md",
				content: "nested",
			});
			await gateway.putEntry({
				namespace: "base",
				branch: "dest",
				key: "foo/body.md",
				content: "dest",
			});
			await gateway.putEntry({
				namespace: "base",
				branch: "dest",
				key: "keep.txt",
				content: "keep",
			});
			expect(
				(
					await gateway.copyEntries({
						namespace: "base",
						fromBranch: "source",
						toBranch: "dest",
						shouldOverwrite: false,
						keyGlob: "foo/*",
					})
				).type,
			).toBe("error");
			expect(
				(
					await gateway.copyEntries({
						namespace: "base",
						fromBranch: "source",
						toBranch: "dest",
						shouldOverwrite: true,
						keyGlob: "foo/*",
					})
				).type,
			).toBe("ok");
			expect(
				await gateway.getEntry({ namespace: "base", branch: "dest", key: "keep.txt" }),
			).toMatchObject({ type: "found" });
			expect(
				await gateway.getEntry({ namespace: "base", branch: "dest", key: "foo/sub/x.md" }),
			).toMatchObject({ type: "found" });
		} finally {
			repo.cleanup();
		}
	});

	it("flags a glob conflict for a destination Entry that matches the glob but is absent from source", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await gateway.putEntry({
				namespace: "base",
				branch: "source",
				key: "foo/body.md",
				content: "source",
			});
			await gateway.putEntry({
				namespace: "base",
				branch: "dest",
				key: "foo/orphan.md",
				content: "orphan",
			});
			expect(
				(
					await gateway.copyEntries({
						namespace: "base",
						fromBranch: "source",
						toBranch: "dest",
						shouldOverwrite: false,
						keyGlob: "foo/*",
					})
				).type,
			).toBe("error");
		} finally {
			repo.cleanup();
		}
	});

	it("reports corrupt Snapshot Entry Keys while listing without throwing", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "notes",
				branch: "source",
				entries: [{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" }],
			});
			const listed = await gateway.listEntries({ namespace: "notes", branch: "source" });
			expectSnapshotCorrupt(listed, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
		} finally {
			repo.cleanup();
		}
	});

	it("refuses to put an Entry over a corrupt existing Snapshot", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "base",
				branch: "main",
				entries: [{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" }],
			});
			const put = await gateway.putEntry({
				namespace: "base",
				branch: "main",
				key: "valid.md",
				content: "valid",
			});
			expectSnapshotCorrupt(put, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
		} finally {
			repo.cleanup();
		}
	});

	it("refuses to delete a valid Entry from a corrupt existing Snapshot", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "base",
				branch: "main",
				entries: [
					{ key: "valid.md", content: "valid" },
					{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" },
				],
			});
			const deleted = await gateway.deleteEntry({
				namespace: "base",
				branch: "main",
				key: "valid.md",
			});
			expectSnapshotCorrupt(deleted, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
		} finally {
			repo.cleanup();
		}
	});

	it("refuses full Namespace Copy from a corrupt source Snapshot", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "notes",
				branch: "source",
				entries: [{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" }],
			});
			const destRef = mustSnapshotRef("notes", "dest");
			const copied = await gateway.copyEntries({
				namespace: "notes",
				fromBranch: "source",
				toBranch: "dest",
				shouldOverwrite: true,
			});
			expectSnapshotCorrupt(copied, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
			expect(snapshotRefExists(repo, destRef)).toBe(false);
		} finally {
			repo.cleanup();
		}
	});

	it("refuses full Namespace Copy into a corrupt destination Snapshot even with overwrite", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect(
				(
					await gateway.putEntry({
						namespace: "notes",
						branch: "source",
						key: "valid.md",
						content: "valid",
					})
				).type,
			).toBe("ok");
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "notes",
				branch: "dest",
				entries: [{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" }],
			});
			const copied = await gateway.copyEntries({
				namespace: "notes",
				fromBranch: "source",
				toBranch: "dest",
				shouldOverwrite: true,
			});
			expectSnapshotCorrupt(copied, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
		} finally {
			repo.cleanup();
		}
	});

	it("validates the whole source Snapshot before key-glob Namespace Copy", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			const corrupt = createCorruptSnapshot(repo, {
				namespace: "base",
				branch: "source",
				entries: [
					{ key: "foo/body.md", content: "valid" },
					{ key: "docs-site/app/[lang]/page.tsx", content: "corrupt" },
				],
			});
			const destRef = mustSnapshotRef("base", "dest");
			const copied = await gateway.copyEntries({
				namespace: "base",
				fromBranch: "source",
				toBranch: "dest",
				shouldOverwrite: true,
				keyGlob: "foo/*",
			});
			expectSnapshotCorrupt(copied, "docs-site/app/[lang]/page.tsx");
			expect(repo.runGit(["rev-parse", "--verify", corrupt.snapshotRef]).trim()).toBe(
				corrupt.commitSha,
			);
			expect(snapshotRefExists(repo, destRef)).toBe(false);
		} finally {
			repo.cleanup();
		}
	});

	it("maps invalid branch names and detached current branch to structured errors", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect(
				(
					await gateway.putEntry({
						namespace: "base",
						branch: "bad---branch",
						key: "a",
						content: "A",
					})
				).type,
			).toBe("error");
			repo.runGit(["checkout", "--detach"]);
			expect(await gateway.currentBranch()).toMatchObject({
				type: "error",
				error: { code: "detached_head" },
			});
		} finally {
			repo.cleanup();
		}
	});

	it("skips invalid Entry Keys when listing a corrupted Snapshot Ref instead of aborting", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			// Craft a poisoned snapshot whose tree contains a path that is not a valid
			// Entry Key (the bracket fails key validation) alongside a valid Entry.
			writeFileSync(join(repo.path, "good.md"), "good\n", "utf8");
			mkdirSync(join(repo.path, "docs-site/app/[lang]/(home)"), { recursive: true });
			writeFileSync(join(repo.path, "docs-site/app/[lang]/(home)/page.tsx"), "x\n", "utf8");
			repo.runGit(["add", "good.md", "docs-site/app/[lang]/(home)/page.tsx"]);
			const tree = repo.runGit(["write-tree"]).trim();
			const commit = repo.runGit(["commit-tree", tree, "-m", "poison"]).trim();
			repo.runGit(["update-ref", "refs/brmem/ns/branch-context/poison", commit]);

			const listed = await gateway.listEntries({ namespace: "branch-context", branch: "poison" });
			if (listed.type !== "ok") throw new Error("list should not abort on an invalid key");
			const keys = listed.value.map((entry) => entry.key);
			expect(keys).toContain("good.md");
			expect(keys).not.toContain("docs-site/app/[lang]/(home)/page.tsx");
		} finally {
			repo.cleanup();
		}
	});

	it("refuses to commit a Snapshot when temp-index isolation fails (GIT_INDEX_FILE dropped)", async () => {
		const repo = createTempGitRepo();
		try {
			// Simulate an exec adapter (e.g. a host runtime) that drops GIT_INDEX_FILE,
			// causing git to fall back to the repository index and capture the whole
			// working tree. The write-path invariant must reject the resulting snapshot.
			const real = new NodeCommandExecApi();
			const envDropping: CommandExecApi = {
				exec(command, args, options) {
					if (options?.env === undefined) return real.exec(command, args, options);
					const env = { ...options.env };
					delete env.GIT_INDEX_FILE;
					return real.exec(command, args, { ...options, env });
				},
			};
			const gateway = new RealGitBrmemGateway(repo.path, envDropping);
			const put = await gateway.putEntry({
				namespace: "branch-context",
				branch: "feat/x",
				key: "plan.md",
				content: "plan body",
			});
			expect(put).toMatchObject({ type: "error", error: { code: "snapshot_tree_mismatch" } });
			// The corrupted snapshot must never have been written (rev-parse --verify
			// exits non-zero for a missing ref, which runGit surfaces as a throw).
			expect(() =>
				repo.runGit(["rev-parse", "--verify", "refs/brmem/ns/branch-context/feat---x"]),
			).toThrow();
		} finally {
			repo.cleanup();
		}
	});

	it("reads and writes git remote config for branch memory", async () => {
		const repo = createTempGitRepo();
		try {
			repo.runGit(["remote", "add", "origin", "/tmp/brmem-setup-test-remote.git"]);
			const gateway = new RealGitBrmemGateway(repo.path);

			const found = await gateway.getRemoteConfig("origin");
			expect(found).toMatchObject({
				type: "found",
				value: {
					push: [],
					fetch: ["+refs/heads/*:refs/remotes/origin/*"],
				},
			});

			expect(
				(
					await gateway.addRemoteRefspecs(
						"origin",
						["HEAD", "refs/brmem/*:refs/brmem/*"],
						["refs/brmem/*:refs/brmem/*"],
					)
				).type,
			).toBe("ok");

			const updated = await gateway.getRemoteConfig("origin");
			expect(updated).toMatchObject({
				type: "found",
				value: {
					push: ["HEAD", "refs/brmem/*:refs/brmem/*"],
					fetch: ["+refs/heads/*:refs/remotes/origin/*", "refs/brmem/*:refs/brmem/*"],
				},
			});
		} finally {
			repo.cleanup();
		}
	});
});

type SnapshotCorruptResult = BrmemResult<
	readonly ListedEntry[] | PutEntryResult | DeleteEntryResult | CopyEntriesResult
>;

interface CorruptSnapshotEntry {
	key: string;
	content: string;
}

interface CorruptSnapshotOptions {
	namespace: string;
	branch: string;
	entries: readonly CorruptSnapshotEntry[];
}

interface CorruptSnapshotResult {
	snapshotRef: string;
	commitSha: string;
}

interface DroppingOptions {
	dropEnv?: boolean;
	dropStdin?: boolean;
}

class DroppingOptionsCommands implements CommandExecApi {
	private readonly delegate = new NodeCommandExecApi();
	private readonly shouldDropEnv: boolean;
	private readonly shouldDropStdin: boolean;

	constructor(options: DroppingOptions) {
		this.shouldDropEnv = options.dropEnv ?? false;
		this.shouldDropStdin = options.dropStdin ?? false;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		return await this.delegate.exec(command, args, {
			...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
			...(this.shouldDropEnv || options?.env === undefined ? {} : { env: options.env }),
			...(options?.timeout === undefined ? {} : { timeout: options.timeout }),
			...(options?.timeoutKillGraceMs === undefined
				? {}
				: { timeoutKillGraceMs: options.timeoutKillGraceMs }),
			...(options?.signal === undefined ? {} : { signal: options.signal }),
			...(this.shouldDropStdin || options?.stdin === undefined ? {} : { stdin: options.stdin }),
			...(options?.onStdout === undefined ? {} : { onStdout: options.onStdout }),
			...(options?.onStderr === undefined ? {} : { onStderr: options.onStderr }),
		});
	}
}

function createCorruptSnapshot(
	repo: TempGitRepo,
	options: CorruptSnapshotOptions,
): CorruptSnapshotResult {
	const snapshotRef = mustSnapshotRef(options.namespace, options.branch);
	const tempDir = mkdtempSync(join(tmpdir(), "brmem-corrupt-index-"));
	try {
		const env = { ...process.env, GIT_INDEX_FILE: join(tempDir, "index") };
		repo.runGit(["read-tree", "--empty"], { env });
		for (const entry of options.entries) {
			const blobSha = repo
				.runGit(["hash-object", "-w", "--stdin"], {
					input: entry.content,
				})
				.trim();
			repo.runGit(["update-index", "--add", "--cacheinfo", `100644,${blobSha},${entry.key}`], {
				env,
			});
		}
		const treeSha = repo.runGit(["write-tree"], { env }).trim();
		const commitSha = repo.runGit(["commit-tree", treeSha, "-m", "corrupt brmem snapshot"]).trim();
		repo.runGit(["update-ref", snapshotRef, commitSha]);
		return { snapshotRef, commitSha };
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

function expectSnapshotCorrupt(result: SnapshotCorruptResult, invalidKey: string): void {
	expect(result).toMatchObject({ type: "error", error: { code: "snapshot_corrupt" } });
	if (result.type !== "error") throw new Error("expected snapshot_corrupt error");
	expect(result.error.message).toContain(invalidKey);
}

function snapshotRefExists(repo: TempGitRepo, snapshotRef: string): boolean {
	try {
		repo.runGit(["rev-parse", "--verify", snapshotRef]);
		return true;
	} catch {
		return false;
	}
}

async function withCommitterDate<T>(date: string, action: () => Promise<T>): Promise<T> {
	const previous = process.env.GIT_COMMITTER_DATE;
	process.env.GIT_COMMITTER_DATE = date;
	try {
		return await action();
	} finally {
		if (previous === undefined) delete process.env.GIT_COMMITTER_DATE;
		else process.env.GIT_COMMITTER_DATE = previous;
	}
}
