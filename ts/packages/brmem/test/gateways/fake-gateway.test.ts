import { describe, expect, it } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-gateway.ts";

describe("FakeBrmemGateway", () => {
	it("reads Base Namespace and named Namespace entries", async () => {
		const gateway = new FakeBrmemGateway({
			currentBranch: "feat/x",
			entries: [
				{ namespace: "base", branch: "feat/x", key: "scratch", content: "base content" },
				{ namespace: "notes", branch: "feat/x", key: "plan/body.md", content: "named content" },
			],
		});
		expect(await gateway.currentBranch()).toEqual({ type: "ok", value: "feat/x" });
		expect(await gateway.getEntry({ namespace: "base", branch: "feat/x", key: "scratch" })).toMatchObject({
			type: "found",
			value: { content: "base content" },
		});
		expect(await gateway.getEntry({ namespace: "notes", branch: "feat/x", key: "missing" })).toEqual({ type: "missing" });
	});

	it("lists entries sorted by Base Namespace, namespace, key, and branch", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "notes", branch: "b", key: "z", content: "z" },
				{ namespace: "base", branch: "b", key: "b", content: "b" },
				{ namespace: "notes", branch: "a", key: "a", content: "a" },
			],
		});
		const result = await gateway.listAllEntries({});
		expect(result).toMatchObject({ type: "ok" });
		if (result.type !== "ok") throw new Error("unexpected error");
		expect(result.value.map((entry) => `${entry.namespace}:${entry.key}:${entry.branch}`)).toEqual([
			"base:b:b",
			"notes:a:a",
			"notes:z:b",
		]);
	});

	it("mutates coherent snapshots without leaking caller-owned state", async () => {
		const gateway = new FakeBrmemGateway();
		expect((await gateway.putEntry({ namespace: "base", branch: "main", key: "a", content: "A" })).type).toBe("ok");
		expect((await gateway.putEntry({ namespace: "base", branch: "main", key: "b", content: "B" })).type).toBe("ok");
		const beforeDelete = await gateway.listEntries({ namespace: "base", branch: "main" });
		if (beforeDelete.type !== "ok") throw new Error("unexpected error");
		expect(beforeDelete.value.map((entry) => entry.key)).toEqual(["a", "b"]);
		expect((await gateway.deleteEntry({ namespace: "base", branch: "main", key: "a" })).type).toBe("ok");
		const afterDelete = await gateway.listEntries({ namespace: "base", branch: "main" });
		if (afterDelete.type !== "ok") throw new Error("unexpected error");
		expect(afterDelete.value.map((entry) => entry.key)).toEqual(["b"]);
	});

	it("reads historical Entry content and diagnostics by commit", async () => {
		const gateway = new FakeBrmemGateway();
		const first = await gateway.putEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", content: "first\n" });
		const second = await gateway.putEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", content: "second\n" });
		if (first.type !== "ok" || second.type !== "ok") throw new Error("unexpected put failure");

		expect(await gateway.getEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md" })).toMatchObject({
			type: "found",
			value: { content: "second\n" },
		});
		expect(await gateway.getEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", at: first.value.commitSha })).toMatchObject({
			type: "found",
			value: { content: "first\n" },
		});
		expect(await gateway.checkEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", at: first.value.commitSha })).toMatchObject({
			type: "found",
			value: { sizeBytes: 6, headSha: first.value.commitSha },
		});
		expect(await gateway.getEntry({ namespace: "handoff", branch: "feat/x", key: "resume.md", at: "unknown" })).toEqual({ type: "missing" });
	});

	it("copies snapshots and key globs with conflict behavior", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "base", branch: "source", key: "foo/body.md", content: "source" },
				{ namespace: "base", branch: "source", key: "foo/sub/x.md", content: "nested" },
				{ namespace: "base", branch: "dest", key: "foo/body.md", content: "dest" },
				{ namespace: "base", branch: "dest", key: "keep.txt", content: "keep" },
			],
		});
		expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", shouldOverwrite: false, keyGlob: "foo/*" })).type).toBe("error");
		const copied = await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", shouldOverwrite: true, keyGlob: "foo/*" });
		expect(copied).toMatchObject({ type: "ok" });
		const entries = await gateway.listEntries({ namespace: "base", branch: "dest" });
		if (entries.type !== "ok") throw new Error("unexpected error");
		expect(entries.value.map((entry) => entry.key)).toEqual(["foo/body.md", "foo/sub/x.md", "keep.txt"]);
	});

	it("flags a glob conflict for a destination Entry that matches the glob but is absent from source", async () => {
		const gateway = new FakeBrmemGateway({
			entries: [
				{ namespace: "base", branch: "source", key: "foo/body.md", content: "source" },
				{ namespace: "base", branch: "dest", key: "foo/orphan.md", content: "orphan" },
			],
		});
		expect((await gateway.copyEntries({ namespace: "base", fromBranch: "source", toBranch: "dest", shouldOverwrite: false, keyGlob: "foo/*" })).type).toBe("error");
	});
});
