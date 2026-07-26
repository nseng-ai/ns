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
		expect(expectedAgentsSkillSymlinkTarget("demo")).toBe("../../skills/demo");
		expect(expectedClaudeSkillSymlinkTarget("demo")).toBe("../../.agents/skills/demo");
	});

	test("recognizes convention mirror symlinks by state and target", () => {
		expect(isAgentsSkillMirror({ type: "symlink", target: "../../skills/demo" }, "demo")).toBe(
			true,
		);
		expect(isAgentsSkillMirror({ type: "symlink", target: "../../skills/other" }, "demo")).toBe(
			false,
		);
		expect(isAgentsSkillMirror({ type: "directory" }, "demo")).toBe(false);
		expect(
			isClaudeSkillMirror({ type: "symlink", target: "../../.agents/skills/demo" }, "demo"),
		).toBe(true);
	});

	test("parses mirror relative paths for both mirror kinds", () => {
		expect(parseSkillMirrorRelativePath(".agents/skills/demo")).toEqual({
			mirrorKind: "agents",
			skillName: "demo",
			expectedTarget: "../../skills/demo",
		});
		expect(parseSkillMirrorRelativePath(".claude/skills/demo")).toEqual({
			mirrorKind: "claude",
			skillName: "demo",
			expectedTarget: "../../.agents/skills/demo",
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
				".agents/skills/demo",
				{ type: "symlink", target: "../../skills/demo" },
				"agents mirror",
				"/repo/.agents/skills/demo",
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
		["missing state", ".agents/skills/demo", undefined, "skill-kind-delete-symlink-missing"],
		[
			"non-symlink state",
			".agents/skills/demo",
			{ type: "directory" } as const,
			"skill-kind-delete-symlink-not-symlink",
		],
		[
			"wrong target",
			".agents/skills/demo",
			{ type: "symlink", target: "../../skills/other" } as const,
			"skill-kind-delete-symlink-wrong-target",
		],
	])("classifies %s against the delete contract", (_label, relativePath, state, expectedCode) => {
		expect(
			classifySkillMirrorSymlinkState(relativePath, state, "mirror", "/repo/mirror"),
		).toMatchObject({ code: expectedCode });
	});
});
