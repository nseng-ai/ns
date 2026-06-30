import { describe, expect, test } from "vitest";

import type { FakeAregSkillKindSkillOptions } from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

function skill(
	name: string,
	skillMd = `---\nname: ${name}\ndescription: ${name}\n---\n`,
	options: Partial<FakeAregSkillKindSkillOptions> = {},
): FakeAregSkillKindSkillOptions {
	return { name, skillMd, ...options };
}

describe("areg doctor skills CLI", () => {
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
				localSkills: [skill("broken", "", { skillMd: { type: "missing" } })],
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
					skill(
						"objective-create",
						"---\nname: objective-create\ndisable-model-invocation: true\n---\n",
						{
							openaiPolicy: "policy:\n  allow_implicit_invocation: false\n",
						},
					),
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
				surface: "objective:create",
			}),
		]);
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
