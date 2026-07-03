import { describe, expect, test } from "vitest";

import type { FakeAregSkillKindSkillOptions } from "../../src/fake-gateways.ts";
import { renderSkillKindList, type SkillKindListResult } from "../../src/operations/skill-kind.ts";
import { runScenario } from "../support/run-scenario.ts";

const BASE_SKILL = "---\nname: demo\ndescription: Demo\n---\n";
const INVOKE_ONLY_SKILL = "---\nname: invoke\ndisable-model-invocation: true\n---\n";
const AMBIENT_ONLY_SKILL = "---\nname: ambient\nuser-invocable: false\n---\n";

const sampleSkillKindListResult: SkillKindListResult = {
	projectDir: "/repo",
	skills: [
		{
			skill: "normal",
			kind: "normal",
			modelInvocation: "enabled",
			nativeDirect: "enabled",
			piExtension: "n/a",
			artifacts: {
				disableModelInvocation: false,
				codexSidecar: false,
				userInvocableKeyPresent: false,
				userInvocableFalse: false,
				piExcluded: false,
			},
			replacement: { verified: false, label: "replacement-missing" },
			notes: ["diagnostic note"],
		},
	],
};

function skill(
	name: string,
	skillMd = `---\nname: ${name}\ndescription: ${name}\n---\n`,
	options: Partial<FakeAregSkillKindSkillOptions> = {},
): FakeAregSkillKindSkillOptions {
	return { name, skillMd, ...options };
}

describe("areg skill list/show CLI", () => {
	test("list reports no managed skills", async () => {
		const run = runScenario(["skill", "list"], { project: { localSkills: [] } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No managed skills found.\n");
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
		expect(run.stderr.join("")).toContain(
			".pi/settings.json is a symlink; refusing to inspect Pi settings.",
		);
	});

	test("list reports clean and diagnostic inferred kinds in human output", async () => {
		const run = runScenario(["skill", "list"], {
			project: {
				piSettings: { skills: ["-skills/code-workflows", "-skills/broken"] },
				replacementSurfaces: ["code:workflows"],
				localSkills: [
					skill("normal", BASE_SKILL),
					skill("invoke", INVOKE_ONLY_SKILL, {
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					}),
					skill(
						"code-workflows",
						"---\nname: code-workflows\ndisable-model-invocation: true\n---\n",
						{ openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" },
					),
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
		expect(output).toMatch(
			/^ambient\s+ambient-only\s+enabled\s+partial\s+n\/a\s+.*ambient-only disables Claude native direct invocation/mu,
		);
		expect(output).toMatch(/^code-workflows\s+command-backed\s+disabled\s+partial\s+enabled$/mu);
		expect(output).toMatch(/^invoke\s+invoke-only\s+disabled\s+enabled\s+n\/a$/mu);
		expect(output).toMatch(/^normal\s+normal\s+enabled\s+enabled\s+n\/a$/mu);
		expect(output).toMatch(
			/^broken\s+inconsistent\s+mixed\s+mixed\s+missing\s+.*disable-model-invocation is present but agents\/openai\.yaml is missing\./mu,
		);
	});

	test("list renderer propagates ANSI capability", () => {
		const colorOutput = renderSkillKindList(sampleSkillKindListResult, { canEmitAnsi: true });
		const plainOutput = renderSkillKindList(sampleSkillKindListResult, { canEmitAnsi: false });
		expect(colorOutput).toContain(String.fromCharCode(0x1b));
		expect(plainOutput).not.toContain(String.fromCharCode(0x1b));
	});

	test("list JSON uses snake_case boundary fields for first-party and vendored skills", async () => {
		const run = runScenario(["skill", "list", "--format", "json"], {
			project: {
				localSkills: [
					skill("demo-skill"),
					skill("vendored-skill", undefined, { sourceType: "vendored" }),
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toEqual({
			projectDir: "/repo",
			skills: [
				{
					skill: "demo-skill",
					kind: "normal",
					modelInvocation: "enabled",
					nativeDirect: "enabled",
					piExtension: "n/a",
					artifacts: {
						disableModelInvocation: false,
						codexSidecar: false,
						userInvocableKeyPresent: false,
						userInvocableFalse: false,
						piExcluded: false,
					},
					replacement: {
						verified: false,
						label: "replacement-missing",
						advice: expect.stringContaining("Skill 'demo-skill' would hide /skill:demo-skill"),
					},
					notes: [],
				},
				{
					skill: "vendored-skill",
					kind: "normal",
					modelInvocation: "enabled",
					nativeDirect: "enabled",
					piExtension: "n/a",
					artifacts: {
						disableModelInvocation: false,
						codexSidecar: false,
						userInvocableKeyPresent: false,
						userInvocableFalse: false,
						piExcluded: false,
					},
					replacement: {
						verified: false,
						label: "replacement-missing",
						advice: expect.stringContaining(
							"Skill 'vendored-skill' would hide /skill:vendored-skill",
						),
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
				replacementSurfaces: ["ji:branch-context:from-plan"],
				localSkills: [
					skill(
						"branch-context-from-plan",
						"---\nname: branch-context-from-plan\ndisable-model-invocation: true\n---\n",
						{
							openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
						},
					),
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
				"- Pi replacement: replacement-verified:ji:branch-context:from-plan",
			].join("\n"),
		);
	});

	test("fails when frontmatter or target project are invalid", async () => {
		const malformed = runScenario(["skill", "list"], {
			project: { localSkills: [skill("bad", "# missing frontmatter\n")] },
		});
		expect(await malformed.exit).toBe(2);
		expect(malformed.stderr.join("")).toContain("missing opening frontmatter delimiter");

		const missingPath = runScenario(["skill", "list", "--path", "missing"], {
			project: { projectDir: "/repo/missing", projectPathState: { type: "missing" } },
		});
		expect(await missingPath.exit).toBe(2);
		expect(missingPath.stderr.join("")).toContain("Target /repo/missing does not exist.");
	});
});
