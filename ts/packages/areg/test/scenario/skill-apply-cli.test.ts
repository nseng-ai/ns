import { describe, expect, test } from "vitest";

import type { FakeAregSkillKindSkillOptions } from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

function skill(name: string, skillMd = `---\nname: ${name}\ndescription: ${name}\n---\n`, options: Partial<FakeAregSkillKindSkillOptions> = {}): FakeAregSkillKindSkillOptions {
	return { name, skillMd, ...options };
}

describe("areg skill apply CLI", () => {
	test("apply invoke-only writes frontmatter and Codex sidecar", async () => {
		const run = runScenario(["skill", "apply", "invoke-only", "demo"], { project: { localSkills: [skill("demo")] } });

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain([
			"Applying invoke-only to demo...",
			"Wrote skills/demo/SKILL.md",
			"Wrote skills/demo/agents/openai.yaml",
			"Skipped .pi/settings.json: -skills/demo absent",
		].join("\n"));
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
		const run = runScenario(["skill", "apply", "command-backed", "demo-skill"], { project: { localSkills: [skill("demo-skill")] } });

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("would hide /skill:demo-skill in Pi");
		expect(run.stdout.join("")).toBe("");
	});

	test("normal requires confirmation before deleting managed artifacts", async () => {
		const managed = "---\nname: demo\ndisable-model-invocation: true\n---\n";
		const declined = runScenario(["skill", "apply", "normal", "demo"], {
			project: { localSkills: [skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" })] },
			prompt: { responses: [false] },
		});
		expect(await declined.exit).toBe(0);
		expect(declined.stdout.join("")).toContain("Declined to apply normal to demo.");

		const accepted = runScenario(["skill", "apply", "--yes", "normal", "demo"], {
			project: { localSkills: [skill("demo", managed, { openaiPolicy: "policy:\n  allow_implicit_invocation: false\n" })] },
		});
		expect(await accepted.exit).toBe(0);
		expect(accepted.stdout.join("")).toContain("Deleted skills/demo/agents/openai.yaml");
		expect(accepted.stdout.join("")).toContain("Removed skills/demo/agents");
	});

	test("apply rejects non-managed sidecar content even with yes", async () => {
		const run = runScenario(["skill", "apply", "--yes", "normal", "demo"], {
			project: { localSkills: [skill("demo", "---\nname: demo\n---\n", { openaiPolicy: "custom: true\n" })] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("non-managed content");
	});

	test("apply rejects duplicate SKILL.md frontmatter keys before writing", async () => {
		const run = runScenario(["skill", "apply", "invoke-only", "demo"], {
			project: { localSkills: [skill("demo", "---\nname: demo\ndisable-model-invocation: false\ndisable-model-invocation: true\n---\n")] },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain('skills/demo/SKILL.md duplicate frontmatter key: "disable-model-invocation"');
		expect(run.stdout.join("")).toBe("");
	});
});
