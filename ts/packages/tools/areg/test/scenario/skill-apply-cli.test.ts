import { createFakeClinkrInteraction, type FakeClinkrInteraction } from "@nseng-ai/clinkr/testing";
import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregProjectGateway,
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
	interaction: FakeClinkrInteraction = createFakeClinkrInteraction(),
): AregCliContext {
	return {
		project,
		git: new InMemoryGitGateway(),
		interaction: interaction.interaction,
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

	test("apply invoke-only writes managed wrapper sidecars for vendored installed skills", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [skill("vendored", undefined, { sourceType: "vendored" })],
		});
		const run = runScenario(["skill", "apply", "invoke-only", "vendored"], {
			context: contextWithProject(project),
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain(
			[
				"Applying invoke-only to vendored...",
				"Wrote .agents/skills/vendored/SKILL.md",
				"Wrote .agents/skills/vendored/agents/openai.yaml",
				"Skipped .pi/settings.json: -skills/vendored absent",
			].join("\n"),
		);
		expect(project.text(".agents/skills/vendored/agents/openai.yaml")).toBe(
			"policy:\n  allow_implicit_invocation: false\n",
		);
	});

	test("apply invoke-only migrates legacy bare sidecar content", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [
				skill("vendored", "---\nname: vendored\ndisable-model-invocation: true\n---\n", {
					sourceType: "vendored",
					openaiPolicy: "allow_implicit_invocation: false\n",
				}),
			],
		});
		const run = runScenario(["skill", "apply", "invoke-only", "vendored"], {
			context: contextWithProject(project),
		});

		expect(await run.exit).toBe(0);
		expect(project.text(".agents/skills/vendored/agents/openai.yaml")).toBe(
			"policy:\n  allow_implicit_invocation: false\n",
		);
	});

	test("dry-run plans command-backed without writing or prompting", async () => {
		const run = runScenario(["skill", "apply", "--dry-run", "command-backed", "code-workflows"], {
			project: {
				replacementSurfaces: ["code:workflows"],
				localSkills: [skill("code-workflows")],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Applying command-backed to code-workflows...");
		expect(output).toContain("Would write skills/code-workflows/SKILL.md");
		expect(output).toContain("Would write skills/code-workflows/agents/openai.yaml");
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
			confirmations: [{ type: "declined" }],
			isInteractive: true,
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Declined to apply normal to demo.");

		const missingYes = runScenario(["skill", "apply", "normal", "demo", "--format", "json"], {
			project: {
				localSkills: [
					skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
				],
			},
		});
		expect(await missingYes.exit).toBe(2);
		expect(JSON.parse(missingYes.stdout.join(""))).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--yes" },
		});

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

	test("apply unlisted converges artifacts and deletes mirror symlinks with --yes", async () => {
		const project = new FakeAregProjectGateway({
			piSettings: { skills: ["-skills/setup-hidden"] },
			localSkills: [
				skill("setup-hidden", "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n", {
					openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					agentsPath: { type: "symlink", target: "../../skills/setup-hidden" },
					claudePath: { type: "symlink", target: "../../.agents/skills/setup-hidden" },
				}),
			],
		});
		const run = runScenario(["skill", "apply", "--yes", "unlisted", "setup-hidden"], {
			context: contextWithProject(project),
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		const output = run.stdout.join("");
		expect(output).toContain("Applying unlisted to setup-hidden...");
		expect(output).toContain(
			"Skipped skills/setup-hidden/SKILL.md: SKILL.md frontmatter already current",
		);
		expect(output).toContain(
			"Skipped skills/setup-hidden/agents/openai.yaml: Codex openai.yaml already current",
		);
		expect(output).toContain("Skipped .pi/settings.json: -skills/setup-hidden already present");
		expect(output).toContain("Deleted symlink .claude/skills/setup-hidden");
		expect(output).toContain("Deleted symlink .agents/skills/setup-hidden");
		const afterApply = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "setup-hidden",
			env: {},
		});
		expect(afterApply.agentsPath).toEqual({ type: "missing" });
		expect(afterApply.claudePath).toEqual({ type: "missing" });
	});

	test("apply unlisted from scratch writes artifacts and skips absent mirrors", async () => {
		const project = new FakeAregProjectGateway({ localSkills: [skill("setup-hidden")] });
		const run = runScenario(["skill", "apply", "unlisted", "setup-hidden"], {
			context: contextWithProject(project),
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Wrote skills/setup-hidden/SKILL.md");
		expect(output).toContain("Wrote skills/setup-hidden/agents/openai.yaml");
		expect(output).toContain("Wrote .pi/settings.json");
		expect(output).toContain(
			"Skipped .claude/skills/setup-hidden: .claude/skills/setup-hidden absent",
		);
		expect(output).toContain(
			"Skipped .agents/skills/setup-hidden: .agents/skills/setup-hidden absent",
		);
		expect(project.text(".pi/settings.json")).toContain("-skills/setup-hidden");
	});

	test("dry-run unlisted plans symlink deletions without prompting or mutating", async () => {
		const project = new FakeAregProjectGateway({
			piSettings: { skills: ["-skills/setup-hidden"] },
			localSkills: [
				skill("setup-hidden", "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n", {
					openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					agentsPath: { type: "symlink", target: "../../skills/setup-hidden" },
					claudePath: { type: "symlink", target: "../../.agents/skills/setup-hidden" },
				}),
			],
		});
		const interaction = createFakeClinkrInteraction();
		const run = runScenario(["skill", "apply", "--dry-run", "unlisted", "setup-hidden"], {
			context: contextWithProject(project, interaction),
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Would delete symlink .claude/skills/setup-hidden");
		expect(output).toContain("Would delete symlink .agents/skills/setup-hidden");
		expect(interaction.requests()).toEqual([]);
		expect(mutationOperations(project.operations())).toEqual([]);
	});

	test("unlisted mirror deletions require confirmation or --yes", async () => {
		const fixture = () =>
			new FakeAregProjectGateway({
				piSettings: { skills: ["-skills/setup-hidden"] },
				localSkills: [
					skill("setup-hidden", "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n", {
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
						agentsPath: { type: "symlink", target: "../../skills/setup-hidden" },
						claudePath: { type: "symlink", target: "../../.agents/skills/setup-hidden" },
					}),
				],
			});

		const missingYes = runScenario(
			["skill", "apply", "unlisted", "setup-hidden", "--format", "json"],
			{
				context: contextWithProject(fixture()),
			},
		);
		expect(await missingYes.exit).toBe(2);
		expect(JSON.parse(missingYes.stdout.join(""))).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--yes" },
		});

		const declinedProject = fixture();
		const declined = runScenario(["skill", "apply", "unlisted", "setup-hidden"], {
			context: contextWithProject(
				declinedProject,
				createFakeClinkrInteraction({ confirmations: [{ type: "declined" }], isInteractive: true }),
			),
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Declined to apply unlisted to setup-hidden.");
		expect(mutationOperations(declinedProject.operations())).toEqual([]);
	});

	test("apply unlisted refuses skills with a registered replacement surface", async () => {
		const run = runScenario(["skill", "apply", "--yes", "unlisted", "branch-retro"], {
			project: { localSkills: [skill("branch-retro")] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"still has a COMMAND_BACKED_SKILL_REGISTRY entry (/branch:retro); remove the registry entry first",
		);
		expect(run.stdout.join("")).toBe("");
	});

	test("apply unlisted refuses vendored skills", async () => {
		const run = runScenario(["skill", "apply", "--yes", "unlisted", "vendored"], {
			project: { localSkills: [skill("vendored", undefined, { sourceType: "vendored" })] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			"is not first-party (.agents/skills/vendored); unlisted only applies to skills/<name>/ sources",
		);
	});

	test("apply unlisted refuses wrong-target mirror symlinks before mutation", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [
				skill("setup-hidden", undefined, {
					claudePath: { type: "symlink", target: "../../elsewhere/setup-hidden" },
				}),
			],
		});
		const run = runScenario(["skill", "apply", "--yes", "unlisted", "setup-hidden"], {
			context: contextWithProject(project),
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain(
			".claude/skills/setup-hidden points to ../../elsewhere/setup-hidden, expected ../../.agents/skills/setup-hidden",
		);
		expect(mutationOperations(project.operations())).toEqual([]);
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
			dryRun: false,
			yes: false,
		});

		if (result.type !== "failure") throw new Error(`expected failure, got ${result.type}`);
		expect(result.errorType).toBe("skill-kind-apply-failed");
		expect(project.text("skills/alpha/SKILL.md")).toBeUndefined();
		expect(mutationOperations(project.operations())).toEqual([]);
		expect(result).toMatchObject({
			data: {
				mutationFailed: true,
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

		expect(await run.exit).toBe(2);
		const output = JSON.parse(run.stdout.join(""));
		expect(output).toMatchObject({
			status: "failure",
			errorType: "skill-kind-apply-failed",
			exitCode: 2,
			data: {
				mutationFailed: true,
				projectDir: "/repo",
				kind: "invoke-only",
				dryRun: false,
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
			dryRun: false,
			yes: false,
		});

		if (result.type !== "failure") throw new Error(`expected failure, got ${result.type}`);
		expect(result.errorType).toBe("skill-kind-apply-failed");
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
								status: "not-attempted",
							}),
						]),
					}),
				],
			},
		});
	});

	test("whole-batch planning preserves shared Pi settings writes across multiple skills", async () => {
		const project = new FakeAregProjectGateway({
			replacementSurfaces: ["branch:retro", "changelog:update"],
			localSkills: [skill("branch-retro"), skill("changelog-update")],
		});

		const result = await runSkillKindApply(contextWithProject(project), {
			path: ".",
			kind: "command-backed",
			skills: ["branch-retro", "changelog-update"],
			dryRun: false,
			yes: false,
		});

		expect(result.type).toBe("ok");
		expect(project.text(".pi/settings.json")).toBe(
			`${JSON.stringify({ skills: ["-skills/branch-retro", "-skills/changelog-update"] }, null, 2)}\n`,
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
		const interaction = createFakeClinkrInteraction({
			confirmations: [{ type: "confirmed" }, { type: "declined" }],
			isInteractive: true,
		});

		const result = await runSkillKindApply(contextWithProject(project, interaction), {
			path: ".",
			kind: "normal",
			skills: ["alpha", "beta"],
			dryRun: false,
			yes: false,
		});

		expect(result).toMatchObject({
			type: "ok",
			human: "Declined to apply normal to beta.",
		});
		expect(interaction.requests()).toHaveLength(2);
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
		const interaction = createFakeClinkrInteraction({ confirmations: [{ type: "declined" }] });

		const result = await runSkillKindApply(contextWithProject(project, interaction), {
			path: ".",
			kind: "normal",
			skills: ["demo"],
			dryRun: true,
			yes: false,
		});

		expect(result.type).toBe("ok");
		expect(interaction.requests()).toEqual([]);
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
