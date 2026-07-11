import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	createEmptyProject,
	dataFromEnvelope,
	parseJsonOutput,
	runNsCliJson,
} from "../support/cli-harness.ts";

describe("ns CLI skills path integration", () => {
	test("resolves skill paths for harness aliases and both scopes", async () => {
		const cwd = await createEmptyProject();
		const homeDir = join(cwd, ".home");
		const cases = [
			{
				harness: "claude",
				scope: "user",
				expectedHarness: "claude-code",
				expectedRoot: join(cwd, ".claude-user", "skills"),
			},
			{
				harness: "claude-code",
				scope: "project",
				expectedHarness: "claude-code",
				expectedRoot: join(cwd, ".claude", "skills"),
			},
			{
				harness: "codex",
				scope: "user",
				expectedHarness: "codex",
				expectedRoot: join(homeDir, ".agents", "skills"),
			},
			{
				harness: "codex",
				scope: "project",
				expectedHarness: "codex",
				expectedRoot: join(cwd, ".agents", "skills"),
			},
			{
				harness: "pi-dev",
				scope: "user",
				expectedHarness: "pi",
				expectedRoot: join(homeDir, ".pi", "agent", "skills"),
			},
			{
				harness: "pi",
				scope: "project",
				expectedHarness: "pi",
				expectedRoot: join(cwd, ".pi", "skills"),
			},
		] as const;

		for (const testCase of cases) {
			const run = await runNsCliJson(
				["skills", "path", "objective", "--harness", testCase.harness, "--scope", testCase.scope],
				cwd,
			);
			const data = dataFromEnvelope(parseJsonOutput(run));

			expect(run.exit).toBe(0);
			expect(data).toMatchObject({
				skill: "objective",
				artifactId: "objective-skill",
				harness: testCase.expectedHarness,
				scope: testCase.scope,
				targetRoot: testCase.expectedRoot,
				targetArtifactPath: join(testCase.expectedRoot, "objective"),
			});
			expect(run.stderr).toBe("");
		}
	});
});
