import { describe, expect, it } from "vitest";

import { RealGitBrmemGateway } from "../../src/real-git-gateway.ts";
import { createTempGitRepo } from "../support/temp-git-repo.ts";

describe("RealGitBrmemGateway", () => {
	it("writes Snapshot Refs and reads/checks/lists Entries in a throwaway repository", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.putEntry({ namespace: "base", branch: "feat/x", key: "body.md", content: "hello" })).type).toBe("ok");
			expect((await gateway.putEntry({ namespace: "base", branch: "feat/x", key: "nested/plan.md", content: "nested" })).type).toBe("ok");
			const read = await gateway.getEntry({ namespace: "base", branch: "feat/x", key: "body.md" });
			expect(read).toMatchObject({ type: "found", value: { content: "hello" } });
			const listed = await gateway.listEntries({ namespace: "base", branch: "feat/x" });
			if (listed.type !== "ok") throw new Error("unexpected list error");
			expect(listed.value.map((entry) => entry.key)).toEqual(["body.md", "nested/plan.md"]);
			const checked = await gateway.checkEntry({ namespace: "base", branch: "feat/x", key: "body.md" });
			expect(checked).toMatchObject({ type: "found", value: { sizeBytes: 5 } });
			expect(repo.runGit(["show", "refs/brmem/base/feat---x:body.md"])).toBe("hello");
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
			expect((await gateway.deleteEntry({ namespace: "base", branch: "main", key: "a" })).type).toBe("ok");
			expect(await gateway.getEntry({ namespace: "base", branch: "main", key: "b" })).toMatchObject({ type: "found" });
			const deletedLast = await gateway.deleteEntry({ namespace: "base", branch: "main", key: "b" });
			expect(deletedLast).toMatchObject({ type: "ok", value: { isSnapshotEmpty: true } });
			expect(repo.runGit(["rev-parse", "--verify", "refs/brmem/base/main"]).trim()).toMatch(/^[0-9a-f]{40}$/u);
			expect(repo.runGit(["ls-tree", "-r", "refs/brmem/base/main"])).toBe("");
		} finally {
			repo.cleanup();
		}
	});

	it("copies snapshots by reassigning the destination ref to the source commit", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			await gateway.putEntry({ namespace: "notes", branch: "source", key: "body.md", content: "source" });
			const sourceSha = repo.runGit(["rev-parse", "refs/brmem/ns/notes/source"]).trim();
			const copied = await gateway.copyEntries({ namespace: "notes", fromBranch: "source", toBranch: "dest", overwrite: true });
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
			await gateway.putEntry({ namespace: "base", branch: "source", key: "foo/body.md", content: "source" });
			await gateway.putEntry({ namespace: "base", branch: "source", key: "foo/sub/x.md", content: "nested" });
			await gateway.putEntry({ namespace: "base", branch: "dest", key: "foo/body.md", content: "dest" });
			await gateway.putEntry({ namespace: "base", branch: "dest", key: "keep.txt", content: "keep" });
			expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", overwrite: false, keyGlob: "foo/*" })).type).toBe("error");
			expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", overwrite: true, keyGlob: "foo/*" })).type).toBe("ok");
			expect(await gateway.getEntry({ namespace: "base", branch: "dest", key: "keep.txt" })).toMatchObject({ type: "found" });
			expect(await gateway.getEntry({ namespace: "base", branch: "dest", key: "foo/sub/x.md" })).toMatchObject({ type: "found" });
		} finally {
			repo.cleanup();
		}
	});

	it("maps invalid branch names and detached current branch to structured errors", async () => {
		const repo = createTempGitRepo();
		try {
			const gateway = new RealGitBrmemGateway(repo.path);
			expect((await gateway.putEntry({ namespace: "base", branch: "bad---branch", key: "a", content: "A" })).type).toBe("error");
			repo.runGit(["checkout", "--detach"]);
			expect(await gateway.currentBranch({ cwd: repo.path })).toMatchObject({ type: "error", error: { code: "detached_head" } });
		} finally {
			repo.cleanup();
		}
	});
});
