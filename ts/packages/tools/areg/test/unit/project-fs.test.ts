import { describe, expect, test } from "vitest";

import { resolveAllowedWriteTarget } from "../../src/gateways/project-fs.ts";

describe("resolveAllowedWriteTarget", () => {
	function resolve(relativePath: string) {
		return resolveAllowedWriteTarget({
			projectRoot: "/repo",
			relativePath,
			description: "test write",
		});
	}

	test.each([
		"skills/demo/SKILL.md",
		".agents/skills/demo/SKILL.md",
		"skills/demo/agents",
		".agents/skills/demo/agents",
		"skills/demo/agents/openai.yaml",
		".agents/skills/demo/agents/openai.yaml",
		".pi/settings.json",
	])("allows skill-kind write target %s", (relativePath) => {
		expect(resolve(relativePath).type).toBe("ok");
	});

	test.each([
		"not-skills/demo/SKILL.md",
		"x.agents/skills/demo/SKILL.md",
		"skills/demo/README.md",
		"skills/demo/agents/other.yaml",
		"nested/skills/demo/SKILL.md",
	])("refuses non-rooted skill-kind write target %s", (relativePath) => {
		expect(resolve(relativePath)).toMatchObject({
			type: "error",
			error: { code: "skill-kind-target-refused" },
		});
	});
});
