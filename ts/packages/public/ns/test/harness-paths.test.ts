import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	ALL_HARNESS_IDS,
	normalizeHarnessId,
	resolveHarnessArtifactPath,
} from "../src/harness-artifacts/harness-paths.ts";

const context = {
	projectRoot: "/repo",
	homeDir: "/home/alice",
};

function skillPath(options: {
	harness: string;
	scope: "project" | "user";
	env?: { CLAUDE_CONFIG_DIR?: string };
}) {
	return resolveHarnessArtifactPath({
		harness: options.harness,
		scope: options.scope,
		kind: "skill",
		artifactName: "objective-next",
		context: {
			...context,
			...(options.env === undefined ? {} : { env: options.env }),
		},
	});
}

describe("harness path table", () => {
	test("matches the ns-init harness id set", () => {
		expect(ALL_HARNESS_IDS).toEqual(["claude-code", "codex", "pi"]);
	});

	test.each([
		["claude-code", "/repo/.claude/skills", "/home/alice/.claude/skills"],
		["codex", "/repo/.agents/skills", "/home/alice/.agents/skills"],
		["pi", "/repo/.pi/skills", "/home/alice/.pi/agent/skills"],
	])("resolves %s skill paths at project and user scope", (harness, projectRoot, userRoot) => {
		const project = skillPath({ harness, scope: "project" });
		const user = skillPath({ harness, scope: "user" });

		expect(project).toMatchObject({ ok: true });
		expect(user).toMatchObject({ ok: true });
		if (!project.ok || !user.ok) return;
		expect(project.value).toMatchObject({
			harness,
			scope: "project",
			rootPath: projectRoot,
			artifactPath: join(projectRoot, "objective-next"),
		});
		expect(user.value).toMatchObject({
			harness,
			scope: "user",
			rootPath: userRoot,
			artifactPath: join(userRoot, "objective-next"),
		});
	});

	test("honors CLAUDE_CONFIG_DIR for claude-code user-scope skill paths", () => {
		const result = skillPath({
			harness: "claude-code",
			scope: "user",
			env: { CLAUDE_CONFIG_DIR: "/tmp/claude-config" },
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.rootPath).toBe("/tmp/claude-config/skills");
		expect(result.value.artifactPath).toBe("/tmp/claude-config/skills/objective-next");
	});

	test.each([
		["claude", "claude-code"],
		[" CLAUDE ", "claude-code"],
		["pi-dev", "pi"],
		["PI", "pi"],
	])("normalizes harness alias %s to %s", (input, expected) => {
		expect(normalizeHarnessId(input)).toEqual({ ok: true, value: expected });
	});

	test("rejects non-skill artifact kinds until later provisioning slices", () => {
		const result = resolveHarnessArtifactPath({
			harness: "pi",
			scope: "project",
			kind: "agent",
			artifactName: "runner",
			context,
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "unsupported_artifact_kind" },
		});
	});
});
