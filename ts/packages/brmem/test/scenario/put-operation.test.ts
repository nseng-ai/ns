import { describe, expect, it } from "vitest";

import { MAX_ENTRY_BYTES } from "../../src/content-limits.ts";
import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import { runScenario } from "../support/run-scenario.ts";

describe("put operation", () => {
	it("stores file content in a named Namespace and round-trips through get", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		const put = runScenario(["put", "notes/body.md", "--namespace", "notes", "--file", "note.md"], {
			gateway,
			files: { "note.md": "hello from file\n" },
		});
		expect(await put.exit).toBe(0);
		const output = put.stdout.join("");
		expect(output).toContain("Stored Entry Key notes/body.md from note.md in Namespace notes on Branch feat/x.");
		expect(output).toContain("Entry Locator: refs/brmem/ns/notes/feat---x:notes/body.md");
		expect(output).toContain("Commit: commit");
		expect(output).toContain("Inspect: git show refs/brmem/ns/notes/feat---x:notes/body.md");
		expect(put.stderr).toEqual([]);

		const get = runScenario(["get", "notes/body.md", "--namespace", "notes"], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("hello from file\n");
	});

	it("emits Python-compatible JSON fields", async () => {
		const run = runScenario(["put", "plan.md", "--namespace", "branch-context", "--file", "plan.md", "--format", "json"], {
			fake: { currentBranch: "feat/x" },
			files: { "plan.md": "plan body\n" },
		});
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			exit_code: 0,
			data: {
				namespace: "branch-context",
				key: "plan.md",
				branch: "feat/x",
				ref_name: "refs/brmem/ns/branch-context/feat---x:plan.md",
				source_file: "plan.md",
			},
		});
		const data = JSON.parse(run.stdout.join("")).data as { commit: string };
		expect(data.commit).toMatch(/^commit/);
	});

	it("uses the Entry Key basename as the default source file", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		const put = runScenario(["put", "plans/plan.md"], { gateway, files: { "plan.md": "default source\n" } });
		expect(await put.exit).toBe(0);
		const get = runScenario(["get", "plans/plan.md"], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("default source\n");
	});

	it("supports stdin only in human mode", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		const put = runScenario(["put", "stdin.md", "--stdin"], { gateway, stdin: "stdin body\n" });
		expect(await put.exit).toBe(0);
		expect(put.stdout.join("")).toContain("Stored Entry Key stdin.md from stdin in Base Namespace on Branch feat/x.");

		const get = runScenario(["get", "stdin.md"], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("stdin body\n");
	});

	it("rejects conflicting or JSON stdin source modes", async () => {
		const jsonStdin = runScenario(["put", "stdin.md", "--stdin", "--format", "json"]);
		expect(await jsonStdin.exit).toBe(2);
		expect(JSON.parse(jsonStdin.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "stdin_unsupported_in_json_mode",
		});

		const conflict = runScenario(["put", "stdin.md", "--stdin", "--file", "stdin.md"]);
		expect(await conflict.exit).toBe(2);
		expect(conflict.stderr.join("")).toContain("--stdin and --file are mutually exclusive.");
	});

	it("maps source read failures to stable error types", async () => {
		const missing = runScenario(["put", "missing.md", "--format", "json"]);
		expect(await missing.exit).toBe(2);
		expect(JSON.parse(missing.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "source_file_missing" });

		const noBasename = runScenario(["put", ".", "--format", "json"]);
		expect(await noBasename.exit).toBe(2);
		expect(JSON.parse(noBasename.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "source_file_missing" });

		const unreadable = runScenario(["put", "secret.md", "--file", "secret.md", "--format", "json"], {
			unreadableFiles: { "secret.md": "permission denied" },
		});
		expect(await unreadable.exit).toBe(2);
		expect(JSON.parse(unreadable.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "source_file_unreadable" });
	});

	it("validates namespace, key, and branch before writing", async () => {
		const invalidNamespace = runScenario(["put", "note.md", "--namespace", "bad/ns", "--file", "note.md", "--format", "json"], {
			files: { "note.md": "body" },
		});
		expect(await invalidNamespace.exit).toBe(2);
		expect(JSON.parse(invalidNamespace.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "invalid_namespace" });

		const invalidKey = runScenario(["put", "bad key", "--file", "note.md", "--format", "json"], { files: { "note.md": "body" } });
		expect(await invalidKey.exit).toBe(2);
		expect(JSON.parse(invalidKey.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "invalid_key" });

		const invalidBranch = runScenario(["put", "note.md", "--branch", "bad---branch", "--file", "note.md", "--format", "json"], {
			files: { "note.md": "body" },
		});
		expect(await invalidBranch.exit).toBe(2);
		expect(JSON.parse(invalidBranch.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "invalid_branch_name" });
	});

	it("skips current-branch resolution when an explicit branch is supplied", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: { type: "detached" } });
		const put = runScenario(["put", "note.md", "--branch", "feat/other", "--file", "note.md"], {
			gateway,
			files: { "note.md": "other branch\n" },
		});
		expect(await put.exit).toBe(0);
		const get = runScenario(["get", "note.md", "--branch", "feat/other"], { gateway });
		expect(await get.exit).toBe(0);
		expect(get.stdout.join("")).toBe("other branch\n");
	});

	it("fails on detached HEAD when branch is omitted", async () => {
		const run = runScenario(["put", "note.md", "--file", "note.md", "--format", "json"], {
			fake: { currentBranch: { type: "detached" } },
			files: { "note.md": "body" },
		});
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "detached_head" });
	});

	it("writes Base Namespace entries with omitted namespace or --namespace base", async () => {
		const omitted = runScenario(["put", "base.md", "--file", "base.md", "--format", "json"], {
			fake: { currentBranch: "feat/x" },
			files: { "base.md": "base" },
		});
		expect(await omitted.exit).toBe(0);
		expect(JSON.parse(omitted.stdout.join(""))).toMatchObject({
			data: { namespace: "base", ref_name: "refs/brmem/base/feat---x:base.md" },
		});

		const explicit = runScenario(["put", "base.md", "--namespace", "base", "--file", "base.md", "--format", "json"], {
			fake: { currentBranch: "feat/x" },
			files: { "base.md": "base" },
		});
		expect(await explicit.exit).toBe(0);
		expect(JSON.parse(explicit.stdout.join(""))).toMatchObject({
			data: { namespace: "base", ref_name: "refs/brmem/base/feat---x:base.md" },
		});
	});

	it("overwrites one Entry while preserving siblings", async () => {
		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		expect(await runScenario(["put", "plan/a.md", "--file", "a.md"], { gateway, files: { "a.md": "a1\n" } }).exit).toBe(0);
		expect(await runScenario(["put", "plan/b.md", "--file", "b.md"], { gateway, files: { "b.md": "b1\n" } }).exit).toBe(0);
		expect(await runScenario(["put", "plan/a.md", "--file", "a.md"], { gateway, files: { "a.md": "a2\n" } }).exit).toBe(0);

		const getA = runScenario(["get", "plan/a.md"], { gateway });
		expect(await getA.exit).toBe(0);
		expect(getA.stdout.join("")).toBe("a2\n");
		const getB = runScenario(["get", "plan/b.md"], { gateway });
		expect(await getB.exit).toBe(0);
		expect(getB.stdout.join("")).toBe("b1\n");
		const list = runScenario(["list"], { gateway });
		expect(await list.exit).toBe(0);
		expect(list.stdout.join("")).toContain("Entry Key plan/a.md");
		expect(list.stdout.join("")).toContain("Entry Key plan/b.md");
	});

	it("enforces size, binary, and UTF-8 guardrails", async () => {
		const oversizedBytes = new Uint8Array(MAX_ENTRY_BYTES + 1).fill(65);
		const oversized = runScenario(["put", "big.md", "--file", "big.md", "--format", "json"], { files: { "big.md": oversizedBytes } });
		expect(await oversized.exit).toBe(2);
		expect(JSON.parse(oversized.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "entry_too_large" });
		expect(JSON.parse(oversized.stdout.join("")).message).toContain("capped at 1 MiB");

		const gateway = new FakeBrmemGateway({ currentBranch: "feat/x" });
		const forcedOversized = runScenario(["put", "big.md", "--file", "big.md", "-f"], { gateway, files: { "big.md": oversizedBytes } });
		expect(await forcedOversized.exit).toBe(0);

		const nul = runScenario(["put", "nul.md", "--file", "nul.md", "--format", "json"], { files: { "nul.md": new Uint8Array([65, 0, 66]) } });
		expect(await nul.exit).toBe(2);
		expect(JSON.parse(nul.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "entry_appears_binary" });

		const forcedNul = runScenario(["put", "nul.md", "--file", "nul.md", "--force"], { gateway, files: { "nul.md": new Uint8Array([65, 0, 66]) } });
		expect(await forcedNul.exit).toBe(0);

		const invalidUtf8 = runScenario(["put", "bad.md", "--file", "bad.md", "--force", "--format", "json"], {
			files: { "bad.md": new Uint8Array([0xff]) },
		});
		expect(await invalidUtf8.exit).toBe(2);
		expect(JSON.parse(invalidUtf8.stdout.join(""))).toMatchObject({ exit_code: 2, error_type: "entry_not_utf8" });
	});

	it("prints JSON schemas eagerly before required key validation", async () => {
		const run = runScenario(["put", "--json-schema"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join(""));
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});
});
