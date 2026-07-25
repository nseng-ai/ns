import { describe, expect, test } from "vitest";

import { runSkillsPath } from "../src/ns/skills-path.ts";
import type { SkillsCommandContext } from "../src/ns/skills-shared.ts";

const baseContext = {
	cwd: "/repo",
	projectRoot: "/repo",
	env: {},
} satisfies SkillsCommandContext;

describe("skills path command", () => {
	test("fails loudly for user-scope paths when no home directory is available", () => {
		const result = runSkillsPath(baseContext, {
			skill: "objective",
			harness: "pi",
			scope: "user",
		});

		expect(result).toMatchObject({
			type: "failure",
			errorType: "missing-home-directory",
			message:
				"pi user-scope provisioning requires a user home in the harness path context. Set HOME for host CLI contexts or pass a domain context homeDir.",
		});
	});

	test("uses the SDK-provided home directory for user-scope paths", () => {
		const result = runSkillsPath(
			{ ...baseContext, homeDir: "/home/alice" },
			{ skill: "objective", harness: "pi", scope: "user" },
		);

		expect(result).toMatchObject({
			type: "ok",
			data: {
				targetRoot: "/home/alice/.pi/agent/skills",
				targetArtifactPath: "/home/alice/.pi/agent/skills/objective",
			},
		});
	});
});
