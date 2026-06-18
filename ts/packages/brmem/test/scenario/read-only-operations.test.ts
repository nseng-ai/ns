import { describe, expect, it } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import { renderList, type ListResult } from "../../src/operations/list.ts";
import { runScenario } from "../support/run-scenario.ts";

const seededEntries = [
	{ namespace: "base", branch: "feat/x", key: "scratch", content: "base content", headSha: "head-base", blobSha: "blob-base" },
	{ namespace: "notes", branch: "feat/x", key: "plan/body.md", content: "named content", headSha: "head-notes", blobSha: "blob-notes" },
	{ namespace: "notes", branch: "other", key: "other.md", content: "other" },
];

const sampleListResult: ListResult = {
	namespace_scope: "all",
	key: null,
	branch: "feat/x",
	base: false,
	all_branches: false,
	entries: [
		{ namespace: "base", key: "scratch", branch: "feat/x", ref_name: "refs/brmem/ns/base/feat---x:scratch" },
		{ namespace: "notes", key: "plan/body.md", branch: "feat/x", ref_name: "refs/brmem/ns/notes/feat---x:plan/body.md" },
	],
};

describe("read-only brmem operations", () => {
	it("get human output prints stored content only", async () => {
		const run = runScenario(["get", "scratch"], { fake: { currentBranch: "feat/x", entries: seededEntries } });
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("base content\n");
		expect(run.stderr).toEqual([]);
	});

	it("get JSON output uses Python-compatible fields", async () => {
		const run = runScenario(["get", "plan/body.md", "--namespace", "notes", "--format", "json"], {
			fake: { currentBranch: "feat/x", entries: seededEntries },
		});
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			exit_code: 0,
			data: {
				namespace: "notes",
				key: "plan/body.md",
				branch: "feat/x",
				content: "named content",
				ref_name: "refs/brmem/ns/notes/feat---x:plan/body.md",
			},
		});
	});

	it("check exits 0 with present metadata for found and missing entries", async () => {
		const present = runScenario(["check", "scratch", "--format", "json"], {
			fake: { currentBranch: "feat/x", entries: seededEntries },
		});
		expect(await present.exit).toBe(0);
		expect(JSON.parse(present.stdout.join(""))).toMatchObject({
			exit_code: 0,
			data: { namespace: "base", key: "scratch", present: true, head_sha: "head-base", blob_sha: "blob-base", size_bytes: 12 },
		});

		const missing = runScenario(["check", "missing", "--format", "json"], {
			fake: { currentBranch: "feat/x", entries: seededEntries },
		});
		expect(await missing.exit).toBe(0);
		expect(JSON.parse(missing.stdout.join(""))).toMatchObject({
			exit_code: 0,
			data: { namespace: "base", key: "missing", present: false, head_sha: null, blob_sha: null, size_bytes: null },
		});
	});

	it("get and check --at read historical fake snapshots", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		const first = await gateway.putEntry({ namespace: "branch-context", branch: "feat/x", key: "plan.md", content: "first plan\n" });
		await gateway.putEntry({ namespace: "branch-context", branch: "feat/x", key: "plan.md", content: "second plan\n" });
		if (first.type !== "ok") throw new Error("unexpected put failure");

		const get = runScenario(["get", "plan.md", "--namespace", "branch-context", "--at", first.value.commitSha], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("first plan\n");

		const check = runScenario(["check", "plan.md", "--namespace", "branch-context", "--at", first.value.commitSha, "--format", "json"], { gateway });
		expect(await check.exit).toBe(0);
		expect(JSON.parse(check.stdout.join(""))).toMatchObject({
			data: { namespace: "branch-context", key: "plan.md", at: first.value.commitSha, head_sha: first.value.commitSha, size_bytes: 11 },
		});
	});

	it("invalid check exits 2", async () => {
		const run = runScenario(["check", "bad key", "--format", "json"], { fake: { currentBranch: "feat/x" } });
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "invalid_key" });
	});

	it("list supports default, all-branches, base, namespace, and conflict behavior", async () => {
		const defaultRun = runScenario(["list", "--format", "json"], {
			fake: { currentBranch: "feat/x", entries: seededEntries },
		});
		expect(await defaultRun.exit).toBe(0);
		expect(JSON.parse(defaultRun.stdout.join(""))).toMatchObject({
			data: { namespace_scope: "all", branch: "feat/x", entries: [{ namespace: "base" }, { namespace: "notes" }] },
		});

		const allBranches = runScenario(["list", "--all-branches", "--namespace", "notes", "--format", "json"], {
			fake: { currentBranch: { type: "detached" }, entries: seededEntries },
		});
		expect(await allBranches.exit).toBe(0);
		expect(JSON.parse(allBranches.stdout.join(""))).toMatchObject({
			data: { namespace_scope: "notes", branch: null, all_branches: true },
		});

		const baseHuman = runScenario(["list", "--base"], { fake: { currentBranch: "feat/x", entries: seededEntries } });
		expect(await baseHuman.exit).toBe(0);
		const baseOutput = baseHuman.stdout.join("");
		expect(baseOutput).toContain("NAMESPACE");
		expect(baseOutput).toContain("ENTRY KEY");
		expect(baseOutput).toContain("BRANCH");
		expect(baseOutput).toMatch(/^─/mu);
		expect(baseOutput).toMatch(/^Base Namespace\s+scratch\s+feat\/x$/mu);

		const conflict = runScenario(["list", "--base", "--namespace", "notes", "--format", "json"], {
			fake: { currentBranch: "feat/x", entries: seededEntries },
		});
		expect(await conflict.exit).toBe(2);
		expect(JSON.parse(conflict.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "base_and_namespace_conflict" });
	});

	it("propagates color capability to the list table renderer", () => {
		const colorOutput = renderList(sampleListResult, { canEmitAnsi: true });
		const plainOutput = renderList(sampleListResult, { canEmitAnsi: false });
		expect(colorOutput).toContain(String.fromCharCode(0x1b));
		expect(plainOutput).not.toContain(String.fromCharCode(0x1b));
	});
});
