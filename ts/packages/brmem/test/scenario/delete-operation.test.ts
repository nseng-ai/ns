import { describe, expect, it } from "vitest";

import { FakeBrmemGateway } from "../../src/fake-gateway.ts";
import { runScenario } from "../support/run-scenario.ts";

describe("delete operation", () => {
	it("deletes an existing named-Namespace Entry and round-trips through get", async () => {
		const gateway = new FakeBrmemGateway({
			currentBranch: "feat/x",
			entries: [
				{ namespace: "scratch", branch: "feat/x", key: "plan/plan.md", content: "hello\n" },
			],
		});
		const deleted = runScenario(["delete", "plan/plan.md", "--namespace", "scratch"], { gateway });
		expect(await deleted.exit).toBe(0);
		const output = deleted.stdout.join("");
		expect(output).toContain(
			"Deleted Entry Key plan/plan.md from Namespace scratch on Branch feat/x.",
		);
		expect(output).toContain("Entry Locator: refs/brmem/ns/scratch/feat---x:plan/plan.md");
		expect(output).toContain("Commit: commit");
		expect(deleted.stderr).toEqual([]);

		const get = runScenario(["get", "plan/plan.md", "--namespace", "scratch"], { gateway });
		expect(await get.exit).toBe(2);
		expect(get.stderr.join("")).toContain("No content for Entry Key plan/plan.md");
	});

	it("emits Python-compatible JSON fields", async () => {
		const run = runScenario(
			["delete", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
			{
				fake: {
					currentBranch: "feat/x",
					entries: [
						{ namespace: "scratch", branch: "feat/x", key: "plan/plan.md", content: "hello\n" },
					],
				},
			},
		);
		expect(await run.exit).toBe(0);
		const parsed = JSON.parse(run.stdout.join(""));
		expect(parsed).toMatchObject({
			exit_code: 0,
			data: {
				namespace: "scratch",
				key: "plan/plan.md",
				branch: "feat/x",
				ref_name: "refs/brmem/ns/scratch/feat---x:plan/plan.md",
			},
		});
		expect(parsed.data.commit).toMatch(/^commit/);
		expect(Object.keys(parsed.data).sort()).toEqual([
			"branch",
			"commit",
			"key",
			"namespace",
			"ref_name",
		]);
	});

	it("reports missing keys with the stable public failure contract", async () => {
		const human = runScenario(["delete", "plan/plan.md", "--namespace", "scratch"], {
			fake: { currentBranch: "feat/x" },
		});
		expect(await human.exit).toBe(2);
		const humanError = human.stderr.join("");
		expect(humanError).toContain("No Entry to delete");
		expect(humanError).toContain("Entry Key=plan/plan.md");
		expect(humanError).toContain("Namespace=scratch");
		expect(humanError).toContain("Branch=feat/x");
		expect(humanError).toContain("refs/brmem/ns/scratch/feat---x:plan/plan.md");

		const json = runScenario(
			["delete", "plan/plan.md", "--namespace", "scratch", "--format", "json"],
			{
				fake: { currentBranch: "feat/x" },
			},
		);
		expect(await json.exit).toBe(2);
		const parsed = JSON.parse(json.stdout.join(""));
		expect(parsed).toMatchObject({ exit_code: 2, error_type: "key_not_found" });
		expect(parsed.message).toContain("No Entry to delete");
	});

	it("preserves sibling Entries", async () => {
		const gateway = new FakeBrmemGateway({
			currentBranch: "feat/x",
			entries: [
				{ namespace: "scratch", branch: "feat/x", key: "plan/a.md", content: "a\n" },
				{ namespace: "scratch", branch: "feat/x", key: "plan/b.md", content: "b\n" },
			],
		});
		expect(
			await runScenario(["delete", "plan/a.md", "--namespace", "scratch"], { gateway }).exit,
		).toBe(0);

		const getA = runScenario(["get", "plan/a.md", "--namespace", "scratch"], { gateway });
		expect(await getA.exit).toBe(2);
		const getB = runScenario(["get", "plan/b.md", "--namespace", "scratch"], { gateway });
		expect(await getB.exit).toBe(0);
		expect(getB.stdout.join("")).toBe("b\n");
		const list = runScenario(["list", "--namespace", "scratch"], { gateway });
		expect(await list.exit).toBe(0);
		const listOutput = list.stdout.join("");
		expect(listOutput).not.toContain("plan/a.md");
		expect(listOutput).toContain("ENTRY KEY");
		expect(listOutput).toMatch(/^Namespace scratch\s+plan\/b\.md\s+feat\/x$/mu);
	});

	it("supports Base Namespace deletion and base normalization", async () => {
		const gateway = new FakeBrmemGateway({
			currentBranch: "feat/x",
			entries: [
				{ namespace: "base", branch: "feat/x", key: "scratchpad", content: "base\n" },
				{ namespace: "base", branch: "feat/x", key: "explicit", content: "explicit\n" },
			],
		});
		const human = runScenario(["delete", "scratchpad"], { gateway });
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toContain(
			"Deleted Entry Key scratchpad from Base Namespace on Branch feat/x.",
		);
		expect(human.stdout.join("")).toContain("Entry Locator: refs/brmem/base/feat---x:scratchpad");

		const json = runScenario(["delete", "explicit", "--namespace", "base", "--format", "json"], {
			gateway,
		});
		expect(await json.exit).toBe(0);
		expect(JSON.parse(json.stdout.join(""))).toMatchObject({
			data: { namespace: "base", key: "explicit", ref_name: "refs/brmem/base/feat---x:explicit" },
		});

		const secondDelete = runScenario(
			["delete", "explicit", "--namespace", "base", "--format", "json"],
			{ gateway },
		);
		expect(await secondDelete.exit).toBe(2);
		expect(JSON.parse(secondDelete.stdout.join(""))).toMatchObject({ error_type: "key_not_found" });
	});

	it("validates namespace, key, and branch before deleting", async () => {
		const invalidNamespace = runScenario([
			"delete",
			"note.md",
			"--namespace",
			"bad/ns",
			"--format",
			"json",
		]);
		expect(await invalidNamespace.exit).toBe(2);
		expect(JSON.parse(invalidNamespace.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "invalid_namespace",
		});

		const invalidKey = runScenario(["delete", "bad key", "--format", "json"]);
		expect(await invalidKey.exit).toBe(2);
		expect(JSON.parse(invalidKey.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "invalid_key",
		});

		const invalidBranch = runScenario([
			"delete",
			"note.md",
			"--branch",
			"bad---branch",
			"--format",
			"json",
		]);
		expect(await invalidBranch.exit).toBe(2);
		expect(JSON.parse(invalidBranch.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "invalid_branch_name",
		});
	});

	it("handles explicit branch resolution and detached HEAD failures", async () => {
		const gateway = new FakeBrmemGateway({
			currentBranch: { type: "detached" },
			entries: [{ namespace: "base", branch: "feat/other", key: "note.md", content: "other\n" }],
		});
		const explicitBranch = runScenario(["delete", "note.md", "--branch", "feat/other"], {
			gateway,
		});
		expect(await explicitBranch.exit).toBe(0);

		const detached = runScenario(["delete", "note.md", "--format", "json"], {
			fake: { currentBranch: { type: "detached" } },
		});
		expect(await detached.exit).toBe(2);
		expect(JSON.parse(detached.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "detached_head",
		});
	});

	it("prints JSON schemas eagerly before required key validation", async () => {
		const run = runScenario(["delete", "--json-schema"]);
		expect(await run.exit).toBe(0);
		const document = JSON.parse(run.stdout.join(""));
		expect(document).toHaveProperty("input_json_schema");
		expect(document).toHaveProperty("output_json_schema");
	});

	it("maps non-key gateway failures through the shared gateway failure path", async () => {
		const run = runScenario(["delete", "note.md", "--format", "json"], {
			fake: {
				currentBranch: "feat/x",
				entries: [{ namespace: "base", branch: "feat/x", key: "note.md", content: "body\n" }],
				operationErrors: { delete: { code: "git_update_ref_failed", message: "boom" } },
			},
		});
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			exit_code: 2,
			error_type: "git_update_ref_failed",
			message: "boom",
		});
	});
});
