import { describe, expect, test } from "vitest";

import type { FakeAregSkillKindSkillOptions } from "../../src/fake-gateways.ts";
import { renderSkillKindList, type SkillKindListResult } from "../../src/operations/skill-kind.ts";
import { runScenario } from "../support/run-scenario.ts";

const BASE_SKILL = "---\nname: demo\ndescription: Demo\n---\n";
const INVOKE_ONLY_SKILL = "---\nname: invoke\ndisable-model-invocation: true\n---\n";
const AMBIENT_ONLY_SKILL = "---\nname: ambient\nuser-invocable: false\n---\n";

const sampleSkillKindListResult: SkillKindListResult = {
	project_dir: "/repo",
	skills: [
		{
			skill: "normal",
			kind: "normal",
			model_invocation: "enabled",
			native_direct: "enabled",
			pi_extension: "n/a",
			artifacts: {
				disable_model_invocation: false,
				codex_sidecar: false,
				user_invocable_key_present: false,
				user_invocable_false: false,
				pi_excluded: false,
			},
			replacement: { verified: false, label: "replacement-missing" },
			notes: ["diagnostic note"],
		},
	],
};

function skill(name: string, skillMd = `---\nname: ${name}\ndescription: ${name}\n---\n`, options: Partial<FakeAregSkillKindSkillOptions> = {}): FakeAregSkillKindSkillOptions {
	return { name, skillMd, ...options };
}

describe("areg skill list/show CLI", () => {
	test("list reports no local skills", async () => {
		const run = runScenario(["skill", "list"], { project: { localSkills: [] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No local skills found.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("list refuses symlinked Pi settings", async () => {
		const run = runScenario(["skill", "list"], {
			project: {
				piSettings: { type: "symlink", target: "outside" },
				localSkills: [skill("demo")],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(".pi/settings.json is a symlink; refusing to inspect Pi settings.");
	});

	test("list reports clean and diagnostic inferred kinds in human output", async () => {
		const run = runScenario(["skill", "list"], {
			project: {
				piSettings: { skills: ["-skills/command-skill", "-skills/broken"] },
				replacementSurfaces: ["command:skill"],
				localSkills: [
					skill("normal", BASE_SKILL),
					skill("invoke", INVOKE_ONLY_SKILL, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
					skill("command-skill", "---\nname: command-skill\ndisable-model-invocation: true\n---\n", { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" }),
					skill("ambient", AMBIENT_ONLY_SKILL),
					skill("broken", "---\nname: broken\ndisable-model-invocation: true\n---\n"),
				],
			},
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("SKILL");
		expect(output).toContain("KIND");
		expect(output).toContain("MODEL");
		expect(output).toContain("NATIVE");
		expect(output).toContain("PI");
		expect(output).toContain("NOTES");
		expect(output).toMatch(/^─/mu);
		expect(output).toMatch(/^ambient\s+ambient-only\s+enabled\s+partial\s+n\/a\s+.*ambient-only disables Claude native direct invocation/mu);
		expect(output).toMatch(/^command-skill\s+command-backed\s+disabled\s+partial\s+enabled$/mu);
		expect(output).toMatch(/^invoke\s+invoke-only\s+disabled\s+enabled\s+n\/a$/mu);
		expect(output).toMatch(/^normal\s+normal\s+enabled\s+enabled\s+n\/a$/mu);
		expect(output).toMatch(/^broken\s+inconsistent\s+mixed\s+mixed\s+missing\s+.*disable-model-invocation is present but agents\/openai\.yaml is missing\./mu);
	});

	test("list renderer propagates color capability", () => {
		const colorOutput = renderSkillKindList(sampleSkillKindListResult, { canEmitAnsi: true });
		const plainOutput = renderSkillKindList(sampleSkillKindListResult, { canEmitAnsi: false });
		expect(colorOutput).toContain(String.fromCharCode(0x1b));
		expect(plainOutput).not.toContain(String.fromCharCode(0x1b));
	});

	test("list JSON uses snake_case boundary fields", async () => {
		const run = runScenario(["skill", "list", "--format", "json"], { project: { localSkills: [skill("demo-skill")] } });

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({
			project_dir: "/repo",
			skills: [
				{
					skill: "demo-skill",
					kind: "normal",
					model_invocation: "enabled",
					native_direct: "enabled",
					pi_extension: "n/a",
					artifacts: {
						disable_model_invocation: false,
						codex_sidecar: false,
						user_invocable_key_present: false,
						user_invocable_false: false,
						pi_excluded: false,
					},
					replacement: {
						verified: false,
						surface: "demo:skill",
						label: "replacement-missing:demo:skill",
						advice: expect.stringContaining("Skill 'demo-skill' would hide /skill:demo-skill"),
					},
					notes: [],
				},
			],
		});
	});

	test("show resolves one skill and renders required labels", async () => {
		const run = runScenario(["skill", "show", "branch-context-from-plan"], {
			project: {
				piSettings: { skills: ["-skills/branch-context-from-plan"] },
				replacementSurfaces: ["branch-context:from-plan"],
				localSkills: [
					skill("branch-context-from-plan", "---\nname: branch-context-from-plan\ndisable-model-invocation: true\n---\n", {
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					}),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain(
			[
				"Skill: branch-context-from-plan",
				"Kind: command-backed",
				"model-invocation: disabled",
				"native-direct: partial",
				"pi-extension: enabled",
				"Artifacts:",
				"- disable-model-invocation: present",
				"- agents/openai.yaml: present",
				"- user-invocable:false: absent",
				"- Pi skill exclusion: present",
				"- Pi replacement: replacement-verified:branch-context:from-plan",
			].join("\n"),
		);
	});

	test("fails when frontmatter or target project are invalid", async () => {
		const malformed = runScenario(["skill", "list"], { project: { localSkills: [skill("bad", "# missing frontmatter\n")] } });
		expect(await malformed.exit).toBe(2);
		expect(malformed.stderr.join("")).toContain("missing opening frontmatter delimiter");

		const missingPath = runScenario(["skill", "list", "--path", "missing"], { project: { projectDir: "/repo/missing", projectPathState: { type: "missing" } } });
		expect(await missingPath.exit).toBe(2);
		expect(missingPath.stderr.join("")).toContain("Target /repo/missing does not exist.");
	});
});
