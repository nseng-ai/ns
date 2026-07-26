import { describe, expect, test } from "vitest";

import {
	classifySkillMirrorSymlinkState,
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
	expectedMirrorTarget,
	isAgentsSkillMirror,
	isClaudeSkillMirror,
	isSkillMirrorRelativePath,
	parseSkillMirrorRelativePath,
} from "../src/harness-artifacts/skill-mirror-conventions.ts";

describe("skill mirror conventions", () => {
	test("computes convention symlink targets", () => {
		expect(expectedAgentsSkillSymlinkTarget("skills/incubating/objectives/objective")).toBe(
			"../../skills/incubating/objectives/objective",
		);
		expect(expectedClaudeSkillSymlinkTarget("objective")).toBe("../../.agents/skills/objective");
	});

	test("recognizes convention mirror symlinks by state and target", () => {
		expect(
			isAgentsSkillMirror(
				{ type: "symlink", target: "../../skills/incubating/objectives/objective" },
				"skills/incubating/objectives/objective",
			),
		).toBe(true);
		expect(
			isAgentsSkillMirror(
				{ type: "symlink", target: "../../skills/other" },
				"skills/incubating/objectives/objective",
			),
		).toBe(false);
		expect(
			isAgentsSkillMirror({ type: "directory" }, "skills/incubating/objectives/objective"),
		).toBe(false);
		expect(
			isClaudeSkillMirror(
				{ type: "symlink", target: "../../.agents/skills/objective" },
				"objective",
			),
		).toBe(true);
	});

	test("parses mirror relative paths for both mirror kinds", () => {
		expect(parseSkillMirrorRelativePath(".agents/skills/objective")).toEqual({
			mirrorKind: "agents",
			skillName: "objective",
			expectedTarget: "../../skills/incubating/objectives/objective",
		});
		expect(parseSkillMirrorRelativePath(".claude/skills/objective")).toEqual({
			mirrorKind: "claude",
			skillName: "objective",
			expectedTarget: "../../.agents/skills/objective",
		});
	});

	test.each([
		"skills/demo",
		".agents/skills",
		".agents/skills/demo/extra",
		".agents/other/demo",
		".cursor/skills/demo",
		".agents/skills/..",
		".agents/skills/.",
	])("rejects non-mirror relative path %s", (relativePath) => {
		expect(parseSkillMirrorRelativePath(relativePath)).toBeUndefined();
		expect(isSkillMirrorRelativePath(relativePath)).toBe(false);
		expect(expectedMirrorTarget(relativePath)).toBeUndefined();
	});

	test("classifies deletable convention symlinks as undefined", () => {
		expect(
			classifySkillMirrorSymlinkState(
				".agents/skills/objective",
				{ type: "symlink", target: "../../skills/incubating/objectives/objective" },
				"agents mirror",
				"/repo/.agents/skills/objective",
			),
		).toBeUndefined();
	});

	test.each([
		[
			"unmanaged path",
			"skills/demo",
			{ type: "symlink", target: "../../skills/demo" } as const,
			"skill-kind-delete-symlink-refused",
		],
		["missing state", ".agents/skills/objective", undefined, "skill-kind-delete-symlink-missing"],
		[
			"non-symlink state",
			".agents/skills/objective",
			{ type: "directory" } as const,
			"skill-kind-delete-symlink-not-symlink",
		],
		[
			"wrong target",
			".agents/skills/objective",
			{ type: "symlink", target: "../../skills/other" } as const,
			"skill-kind-delete-symlink-wrong-target",
		],
	])("classifies %s against the delete contract", (_label, relativePath, state, expectedCode) => {
		expect(
			classifySkillMirrorSymlinkState(relativePath, state, "mirror", "/repo/mirror"),
		).toMatchObject({ code: expectedCode });
	});
});
