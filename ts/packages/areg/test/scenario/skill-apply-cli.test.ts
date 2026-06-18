import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregProjectGateway,
	FakeAregPromptGateway,
	type FakeAregProjectOperation,
	type FakeAregSkillKindSkillOptions,
} from "../../src/fake-gateways.ts";
import { runSkillKindApply } from "../../src/operations/skill-kind.ts";
import { runScenario } from "../support/run-scenario.ts";

function skill(
	name: string,
	skillMd = `---\nname: ${name}\ndescription: ${name}\n---\n`,
	options: Partial<FakeAregSkillKindSkillOptions> = {},
): FakeAregSkillKindSkillOptions {
	return { name, skillMd, ...options };
}

function contextWithProject(
	project: FakeAregProjectGateway,
	prompt = new FakeAregPromptGateway(),
): AregCliContext {
	return {
		host: new FakeAregHostGateway(),
		github: new FakeAregGithubGateway(),
		skillxWorkspace: {
			installIntoWorkspace: async () => ({
				type: "error",
				error: { code: "not-used", message: "not used" },
			}),
			cleanupWorkspace: async () => ({ ok: true, value: undefined }),
		},
		project,
		git: new InMemoryGitGateway(),
		npxSkills: new FakeAregNpxSkillsGateway(),
		prompt,
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
	};
}

function mutationOperations(
	operations: readonly FakeAregProjectOperation[],
): readonly FakeAregProjectOperation[] {
	return operations.filter(
		(operation) =>
			operation.type === "write-text-file" ||
			operation.type === "delete-file" ||
			operation.type === "remove-empty-dir",
	);
}

describe("areg skill apply CLI", () => {
	test("apply invoke-only writes frontmatter and Codex sidecar", async () => {
		const run = runScenario(["skill", "apply", "invoke-only", "demo"], {
			project: { localSkills: [skill("demo")] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain(
			[
				"Applying invoke-only to demo...",
				"Wrote skills/demo/SKILL.md",
				"Wrote skills/demo/agents/openai.yaml",
				"Skipped .pi/settings.json: -skills/demo absent",
			].join("\n"),
		);
	});

	test("dry-run plans command-backed without writing or prompting", async () => {
		const run = runScenario(["skill", "apply", "--dry-run", "command-backed", "demo-skill"], {
			project: {
				replacementSurfaces: ["demo:skill"],
				localSkills: [skill("demo-skill")],
			},
			prompt: { responses: [false] },
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Applying command-backed to demo-skill...");
		expect(output).toContain("Would write skills/demo-skill/SKILL.md");
		expect(output).toContain("Would write skills/demo-skill/agents/openai.yaml");
		expect(output).toContain("Would write .pi/settings.json");
	});

	test("command-backed missing replacement fails before mutation", async () => {
		const run = runScenario(["skill", "apply", "command-backed", "demo-skill"], {
			project: { localSkills: [skill("demo-skill")] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("would hide /skill:demo-skill in Pi");
		expect(run.stdout.join("")).toBe("");
	});

	test("normal requires confirmation before deleting managed artifacts", async () => {
		const managed = "---\nname: demo\ndisable-model-invocation: true\n---\n";
		const declined = runScenario(["skill", "apply", "normal", "demo"], {
			project: {
				localSkills: [
					skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
				],
			},
			prompt: { responses: [false] },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Declined to apply normal to demo.");

		const accepted = runScenario(["skill", "apply", "--yes", "normal", "demo"], {
			project: {
				localSkills: [
					skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
				],
			},
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.stdout.join("")).toContain("Deleted skills/demo/agents/openai.yaml");
		expect(accepted.stdout.join("")).toContain("Removed skills/demo/agents");
	});

	test("apply rejects non-managed sidecar content even with yes", async () => {
		const run = runScenario(["skill", "apply", "--yes", "normal", "demo"], {
			project: {
				localSkills: [skill("demo", "---\nname: demo\n---\n", { openaiPolicy: "custom: true\n" })],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("non-managed content");
	});

	test("apply rejects duplicate SKILL.md frontmatter keys before writing", async () => {
		const run = runScenario(["skill", "apply", "invoke-only", "demo"], {
			project: {
				localSkills: [
					skill(
						"demo",
						"---\nname: demo\ndisable-model-invocation: false\ndisable-model-invocation: true\n---\n",
					),
				],
			},
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			'skills/demo/SKILL.md duplicate frontmatter key: "disable-model-invocation"',
		);
		expect(run.stdout.join("")).toBe("");
	});

	test("later skill preflight failure leaves earlier skill untouched", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [skill("alpha"), skill("beta")],
			preflightFailures: { "skills/beta/SKILL.md": { code: "blocked", message: "beta blocked" } },
		});

		const result = await runSkillKindApply(contextWithProject(project), {
			path: ".",
			kind: "invoke-only",
			skills: ["alpha", "beta"],
			dry_run: false,
			yes: false,
		});

		expect(result.type).toBe("shell-negative");
		expect(project.text("skills/alpha/SKILL.md")).toBeUndefined();
		expect(mutationOperations(project.operations())).toEqual([]);
		expect(result).toMatchObject({
			data: {
				mutation_failed: true,
				operations: expect.arrayContaining([
					expect.objectContaining({
						type: "write",
						path: "skills/beta/SKILL.md",
						status: "failed",
					}),
				]),
			},
		});
	});

	test("JSON preflight failure exposes mutation evidence through CLI envelope", async () => {
		const run = runScenario(
			["skill", "apply", "invoke-only", "alpha", "beta", "--format", "json"],
			{
				project: {
					localSkills: [skill("alpha"), skill("beta")],
					preflightFailures: {
						"skills/beta/SKILL.md": { code: "blocked", message: "beta blocked" },
					},
				},
			},
		);

		expect(await run.exit).toBe(1);
		const output = JSON.parse(run.stdout.join(""));
		expect(output).toMatchObject({
			exit_code: 1,
			data: {
				mutation_failed: true,
				project_dir: "/repo",
				kind: "invoke-only",
				dry_run: false,
				operations: expect.arrayContaining([
					expect.objectContaining({
						type: "write",
						path: "skills/beta/SKILL.md",
						status: "failed",
					}),
				]),
				skills: expect.arrayContaining([
					expect.objectContaining({
						skill: "beta",
						operations: expect.arrayContaining([
							expect.objectContaining({ path: "skills/beta/SKILL.md", status: "failed" }),
						]),
					}),
				]),
			},
		});
	});

	test("execution failure reports earlier applied and later not attempted", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [skill("alpha"), skill("beta")],
			mutationFailures: { "skills/beta/SKILL.md": { code: "blocked", message: "beta blocked" } },
		});

		const result = await runSkillKindApply(contextWithProject(project), {
			path: ".",
			kind: "invoke-only",
			skills: ["alpha", "beta"],
			dry_run: false,
			yes: false,
		});

		expect(result.type).toBe("shell-negative");
		expect(project.text("skills/alpha/SKILL.md")).toContain("disable-model-invocation: true");
		expect(project.text("skills/beta/SKILL.md")).toBeUndefined();
		expect(result).toMatchObject({
			data: {
				skills: [
					expect.objectContaining({
						operations: expect.arrayContaining([
							expect.objectContaining({ path: "skills/alpha/SKILL.md", status: "applied" }),
						]),
					}),
					expect.objectContaining({
						operations: expect.arrayContaining([
							expect.objectContaining({ path: "skills/beta/SKILL.md", status: "failed" }),
							expect.objectContaining({
								path: "skills/beta/agents/openai.yaml",
								status: "not_attempted",
							}),
						]),
					}),
				],
			},
		});
	});

	test("whole-batch planning preserves shared Pi settings writes across multiple skills", async () => {
		const project = new FakeAregProjectGateway({
			replacementSurfaces: ["foo:alpha", "foo:beta"],
			localSkills: [skill("foo-alpha"), skill("foo-beta")],
		});

		const result = await runSkillKindApply(contextWithProject(project), {
			path: ".",
			kind: "command-backed",
			skills: ["foo-alpha", "foo-beta"],
			dry_run: false,
			yes: false,
		});

		expect(result.type).toBe("ok");
		expect(project.text(".pi/settings.json")).toBe(
			`${JSON.stringify({ skills: ["-skills/foo-alpha", "-skills/foo-beta"] }, null, 2)}\n`,
		);
	});

	test("declining any deletion confirmation happens before preflight or mutation", async () => {
		const managed = "---\nname: demo\ndisable-model-invocation: true\n---\n";
		const project = new FakeAregProjectGateway({
			localSkills: [
				skill("alpha", managed.replace("demo", "alpha"), {
					openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
				}),
				skill("beta", managed.replace("demo", "beta"), {
					openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
				}),
			],
		});
		const prompt = new FakeAregPromptGateway({ responses: [true, false] });

		const result = await runSkillKindApply(contextWithProject(project, prompt), {
			path: ".",
			kind: "normal",
			skills: ["alpha", "beta"],
			dry_run: false,
			yes: false,
		});

		expect(result).toMatchObject({
			type: "negative",
			message: "Declined to apply normal to beta.",
		});
		expect(prompt.operations()).toHaveLength(2);
		expect(
			project
				.operations()
				.some(
					(operation) =>
						operation.type.startsWith("preflight-") || mutationOperations([operation]).length > 0,
				),
		).toBe(false);
	});

	test("dry-run remains non-mutating and does not prompt", async () => {
		const managed = "---\nname: demo\ndisable-model-invocation: true\n---\n";
		const project = new FakeAregProjectGateway({
			localSkills: [
				skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
			],
		});
		const prompt = new FakeAregPromptGateway({ responses: [false] });

		const result = await runSkillKindApply(contextWithProject(project, prompt), {
			path: ".",
			kind: "normal",
			skills: ["demo"],
			dry_run: true,
			yes: false,
		});

		expect(result.type).toBe("ok");
		expect(prompt.operations()).toEqual([]);
		expect(
			project
				.operations()
				.some(
					(operation) =>
						operation.type.startsWith("preflight-") || mutationOperations([operation]).length > 0,
				),
		).toBe(false);
	});
});
