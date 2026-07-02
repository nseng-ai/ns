import { describe, expect, test } from "vitest";

import { runScenario } from "../support/run-scenario.ts";

const DEMO_SKILL =
	"---\nname: demo\ndescription: Demo skill\ndisable-model-invocation: true\n---\n# Body\n";

function jsonOutput(run: { stdout: string[] }): unknown {
	return JSON.parse(run.stdout.join(""));
}

describe("areg skill find CLI", () => {
	test("finds a first-party skill and renders a copyable SKILL.md path", async () => {
		const run = runScenario(["skill", "find", "demo"], {
			project: { findSkills: [{ name: "demo", root: "skills", skillMd: DEMO_SKILL }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toBe("demo\n  skills/demo/SKILL.md\n");
	});

	test("includes parsed frontmatter with predicate boolean naming", async () => {
		const run = runScenario(["skill", "find", "demo", "--format", "json"], {
			project: { findSkills: [{ name: "demo", root: "skills", skillMd: DEMO_SKILL }] },
		});

		expect(await run.exit).toBe(0);
		expect(jsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				preferred: {
					frontmatterName: "demo",
					description: "Demo skill",
					shouldDisableModelInvocation: true,
				},
			},
		});
	});

	test("finds vendored and Claude-root skills", async () => {
		const vendored = runScenario(["skill", "find", "vendored", "--format", "json"], {
			project: { findSkills: [{ name: "vendored", root: ".agents/skills" }] },
		});
		const claude = runScenario(["skill", "find", "claude-only", "--format", "json"], {
			project: { findSkills: [{ name: "claude-only", root: ".claude/skills" }] },
		});

		expect(await vendored.exit).toBe(0);
		expect(await claude.exit).toBe(0);
		expect(jsonOutput(vendored)).toMatchObject({
			status: "ok",
			data: {
				preferred: {
					root: ".agents/skills",
					sourceType: "vendored",
					skillFileRelativePath: ".agents/skills/vendored/SKILL.md",
				},
			},
		});
		expect(jsonOutput(claude)).toMatchObject({
			status: "ok",
			data: {
				preferred: {
					root: ".claude/skills",
					sourceType: "claude",
					skillFileRelativePath: ".claude/skills/claude-only/SKILL.md",
				},
			},
		});
	});

	test("returns duplicate exact matches in root precedence with one preferred", async () => {
		const run = runScenario(["skill", "find", "demo", "--format", "json"], {
			project: {
				findSkills: [
					{ name: "demo", root: ".claude/skills" },
					{ name: "demo", root: ".agents/skills" },
					{ name: "demo", root: "skills" },
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(jsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				projectDir: "/repo",
				query: "demo",
				preferred: {
					root: "skills",
					isPreferred: true,
					skillFileRelativePath: "skills/demo/SKILL.md",
				},
				matches: [
					{ root: "skills", isPreferred: true },
					{ root: ".agents/skills", isPreferred: false },
					{ root: ".claude/skills", isPreferred: false },
				],
				searchedRoots: [
					{ searchedRelativePath: "skills/demo/SKILL.md" },
					{ searchedRelativePath: ".agents/skills/demo/SKILL.md" },
					{ searchedRelativePath: ".claude/skills/demo/SKILL.md" },
				],
			},
		});
	});

	test("missing exact match exits 1 with candidates and does not auto-select fuzzy matches", async () => {
		const run = runScenario(["skill", "find", "objective-creat", "--format", "json"], {
			project: {
				findSkills: [
					{ name: "objective-create", root: "skills" },
					{ name: "objective-close", root: ".agents/skills" },
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toBe("");
		expect(jsonOutput(run)).toMatchObject({
			status: "negative",
			exitCode: 1,
			message: "Skill not found: objective-creat",
			data: {
				projectDir: "/repo",
				query: "objective-creat",
				matches: [],
				candidates: [{ name: "objective-create", roots: ["skills"] }],
				candidateLimit: 10,
			},
		});
	});

	test("human miss output lists searched roots and suggestions", async () => {
		const run = runScenario(["skill", "find", "objective-creat"], {
			project: { findSkills: [{ name: "objective-create", root: "skills" }] },
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Skill not found: objective-creat\nSearched:");
		expect(run.stderr.join("")).toContain("skills/objective-creat/SKILL.md");
		expect(run.stderr.join("")).toContain("Did you mean:\n  objective-create");
	});

	test("malformed frontmatter still returns path evidence with a warning", async () => {
		const run = runScenario(["skill", "find", "bad", "--format", "json"], {
			project: { findSkills: [{ name: "bad", root: "skills", skillMd: "# no frontmatter\n" }] },
		});

		expect(await run.exit).toBe(0);
		expect(jsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				preferred: {
					skillFileRelativePath: "skills/bad/SKILL.md",
					warnings: [
						{
							code: "frontmatter-missing-opening-delimiter",
							path: "skills/bad/SKILL.md",
						},
					],
				},
			},
		});
	});
});
