import { describe, expect, test } from "vitest";

import type {
	FakeAregCheckSkillOptions,
	FakeAregSkillKindSkillOptions,
} from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

type SkillFixtureOptions = Omit<Partial<FakeAregSkillKindSkillOptions>, "name">;

function skill(name: string, options: SkillFixtureOptions = {}): FakeAregSkillKindSkillOptions {
	return {
		...options,
		name,
		skillMd: options.skillMd ?? `---\nname: ${name}\ndescription: ${name}\n---\n`,
	};
}

function localCheckSkill(
	name: string,
	options: Partial<FakeAregCheckSkillOptions> = {},
): FakeAregCheckSkillOptions {
	return {
		name,
		skillsPath: { type: "directory" },
		agentsPath: { type: "symlink", target: `../../skills/${name}` },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		localSkillMd: `---\nname: ${name}\ndescription: ${name}\n---\n`,
		remoteSkillMd: `---\nname: ${name}\ndescription: ${name}\n---\n`,
		...options,
	};
}

function vendoredCheckSkill(
	name: string,
	options: Partial<FakeAregCheckSkillOptions> = {},
): FakeAregCheckSkillOptions {
	return {
		name,
		agentsPath: { type: "directory" },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		remoteSkillMd: `---\nname: ${name}\ndescription: ${name}\n---\n`,
		...options,
	};
}

describe("areg doctor skills CLI", () => {
	test("reports manifest-provisioned skill provenance", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				manifestSkillSources: [
					{
						skillName: "manifest-skill",
						targetSkillRelativePath: ".pi/skills/manifest-skill",
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.data.findings).toContainEqual(
			expect.objectContaining({
				code: "manifest-skill-source",
				severity: "info",
				skill: "manifest-skill",
				evidence: expect.objectContaining({
					manifestKey: "skill:manifest-skill:pi:project",
					packageName: "@example/skills",
				}),
			}),
		);
	});

	test("reports all clear when areg, Pi inventory, and replacements align", async () => {
		const run = runScenario(["doctor", "skills"], {
			project: {
				skillsDirectoryNames: ["demo"],
				localSkills: [skill("demo")],
				piSkillInventory: { skillNames: ["demo"], isApproximation: false, source: "test" },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No skill registry drift found.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("does not report areg-managed agent symlink mirrors as shadowed", async () => {
		const run = runScenario(["doctor", "skills"], {
			project: {
				skillsDirectoryNames: ["local"],
				agentsSkillNames: ["local", "vendored"],
				claudeSkillNames: ["local", "vendored"],
				checkSkills: [localCheckSkill("local"), vendoredCheckSkill("vendored")],
				localSkills: [skill("local"), skill("vendored", { sourceType: "vendored" })],
				piSkillInventory: {
					skillNames: ["local", "vendored"],
					isApproximation: false,
					source: "test",
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No skill registry drift found.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("reports real duplicate canonical skill roots as shadowed", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				skillsDirectoryNames: ["demo"],
				agentsSkillNames: ["demo"],
				checkSkills: [localCheckSkill("demo", { agentsPath: { type: "directory" } })],
				localSkills: [skill("demo")],
				piSkillInventory: { skillNames: ["demo"], isApproximation: false, source: "test" },
			},
		});

		expect(await run.exit).toBe(1);
		const findings = JSON.parse(run.stdout.join("")).data.findings;
		expect(findings).toContainEqual(
			expect.objectContaining({
				code: "skill-root-shadowed",
				severity: "warning",
				skill: "demo",
				evidence: expect.objectContaining({
					independentRoots: ["skills", ".agents/skills"],
				}),
			}),
		);
	});

	test("reports observed-style missing Pi model-facing inventory", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				skillsDirectoryNames: ["objective-create"],
				localSkills: [skill("objective-create")],
				piSkillInventory: {
					skillNames: [],
					isApproximation: false,
					source: "test-startup-inventory",
				},
			},
		});

		expect(await run.exit).toBe(1);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.status).toBe("negative");
		expect(body.data.summary).toMatchObject({
			status: "warning",
			findingCounts: { error: 0, warning: 1, info: 0 },
		});
		expect(body.data.findings).toContainEqual(
			expect.objectContaining({
				code: "pi-inventory-missing-skill",
				severity: "warning",
				skill: "objective-create",
				evidence: expect.objectContaining({ piInventorySource: "test-startup-inventory" }),
			}),
		);
	});

	test("renders actionable human diagnostics for drift", async () => {
		const run = runScenario(["doctor", "skills"], {
			project: {
				skillsDirectoryNames: ["objective-create"],
				localSkills: [skill("objective-create")],
				piSkillInventory: {
					skillNames: [],
					isApproximation: false,
					source: "test-startup-inventory",
				},
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe("");
		const stderr = run.stderr.join("");
		expect(stderr).toContain("Skill doctor: warning (0 error, 1 warning, 0 info)");
		expect(stderr).toContain("Project: /repo");
		expect(stderr).toContain("warning  pi-inventory-missing-skill  (1)");
		expect(stderr).toContain("objective-create");
		expect(stderr).toContain("Fix: Refresh Pi startup skill inventory");
		expect(stderr).toContain("areg doctor skills --format json");
	});

	test("reports filesystem root drift", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				skillsDirectoryNames: ["broken"],
				checkSkills: [
					{
						name: "broken",
						skillsPath: { type: "directory" },
						localSkillMd: { type: "missing" },
					},
				],
				localSkills: [skill("broken", { skillMd: { type: "missing" } })],
				piSkillInventory: { skillNames: ["broken"], source: "test" },
			},
		});

		expect(await run.exit).toBe(1);
		const findings = JSON.parse(run.stdout.join("")).data.findings;
		expect(findings).toContainEqual(
			expect.objectContaining({
				code: "skill-root-missing-skill-md",
				severity: "error",
				skill: "broken",
				path: "skills/broken/SKILL.md",
			}),
		);
	});

	test("reports replacement command drift for excluded command-backed skills", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				piSettings: { skills: ["-skills/objective-create"] },
				skillsDirectoryNames: ["objective-create"],
				localSkills: [
					skill("objective-create", {
						skillMd: "---\nname: objective-create\ndisable-model-invocation: true\n---\n",
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					}),
				],
				piSkillInventory: { skillNames: ["objective-create"], source: "test" },
				replacementSurfaces: [],
			},
		});

		expect(await run.exit).toBe(1);
		const findings = JSON.parse(run.stdout.join("")).data.findings;
		expect(findings).toEqual([
			expect.objectContaining({
				code: "excluded-skill-without-replacement",
				severity: "error",
				skill: "objective-create",
				surface: "ns:objective:create",
			}),
		]);
	});

	test("does not report replacement drift for healthy unlisted skills", async () => {
		const run = runScenario(["doctor", "skills"], {
			project: {
				piSettings: { skills: ["-skills/setup-hidden"] },
				skillsDirectoryNames: ["setup-hidden"],
				checkSkills: [
					localCheckSkill("setup-hidden", {
						agentsPath: { type: "missing" },
						claudePath: { type: "missing" },
					}),
				],
				localSkills: [
					skill("setup-hidden", {
						skillMd: "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n",
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
					}),
				],
				piSkillInventory: { skillNames: ["setup-hidden"], isApproximation: false, source: "test" },
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No skill registry drift found.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("still reports replacement drift for degraded unlisted-like skills", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				piSettings: { skills: ["-skills/setup-hidden"] },
				skillsDirectoryNames: ["setup-hidden"],
				localSkills: [
					skill("setup-hidden", {
						skillMd: "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n",
						openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
						agentsPath: { type: "symlink", target: "../../skills/setup-hidden" },
						claudePath: { type: "symlink", target: "../../.agents/skills/setup-hidden" },
					}),
				],
				piSkillInventory: { skillNames: ["setup-hidden"], isApproximation: false, source: "test" },
			},
		});

		expect(await run.exit).toBe(1);
		const findings = JSON.parse(run.stdout.join("")).data.findings;
		expect(findings).toContainEqual(
			expect.objectContaining({
				code: "excluded-skill-without-replacement",
				severity: "error",
				skill: "setup-hidden",
			}),
		);
	});

	test("machine-readable result shape includes stable summary and finding fields", async () => {
		const run = runScenario(["doctor", "skills", "--format", "json"], {
			project: {
				skillsDirectoryNames: ["demo"],
				localSkills: [skill("demo")],
				piSkillInventory: { skillNames: [], source: "test" },
			},
		});

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "negative",
			exitCode: 1,
			data: {
				projectDir: "/repo",
				summary: {
					status: "warning",
					findingCounts: { error: 0, warning: 1, info: 0 },
				},
				findings: [
					expect.objectContaining({
						code: "pi-inventory-missing-skill",
						severity: "warning",
						message: expect.any(String),
						remediation: expect.any(String),
						skill: "demo",
					}),
				],
			},
		});
	});
});
