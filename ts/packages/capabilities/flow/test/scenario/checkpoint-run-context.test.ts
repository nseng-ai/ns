import { describe, expect, test } from "vitest";

import type { ActiveOperation } from "@nseng-ai/kernel/sdk";

import { runCheckpointWorkflow } from "../../src/checkpoint/checkpoint.ts";
import { createNsSubmitRuntime } from "../../src/submit/ns-runtime.ts";
import { ScriptedNsTestContext } from "./ns-cli-fakes.ts";

describe("checkpoint run context", () => {
	test("one callback reports gateway commands and checkpoint model work with clears", async () => {
		const snapshots: ActiveOperation[][] = [];
		const ctx = new ScriptedNsTestContext(
			{
				exec: [
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
					{
						match: "git diff HEAD --no-ext-diff",
						result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
					},
				],
				textGeneration: [
					{ ok: true, text: "[cp] Add checkpoint context\n\n- Share active operation feedback" },
				],
			},
			{
				cwd: "/repo",
				env: {},
				execResponses: () => [],
				textGenerationResults: () => [],
			},
		);
		const runtime = createNsSubmitRuntime(ctx);
		const checkpointRunContext = runtime.createCheckpointRunContext((operations) =>
			snapshots.push([...operations]),
		);

		const checkpoint = await runCheckpointWorkflow({
			cwd: ctx.cwd,
			env: ctx.env,
			...checkpointRunContext,
			textGenerator: ctx.textGenerator,
			repoRoot: ctx.cwd,
			dryRun: true,
		});

		expect(checkpoint.type).toBe("dry-run");
		expect(snapshots).toEqual([
			[{ kind: "command", display: "git symbolic-ref --short HEAD" }],
			[],
			[{ kind: "command", display: "git status --porcelain=v1" }],
			[],
			[{ kind: "command", display: "git diff HEAD --no-ext-diff" }],
			[],
			[
				{
					kind: "model",
					operation: "generating checkpoint message",
					modelRef: expect.any(String),
				},
			],
			[],
		]);
	});
});
