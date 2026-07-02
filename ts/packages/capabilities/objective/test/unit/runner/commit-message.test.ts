import { describe, expect, test } from "vitest";

import { commitRunnerStep, composeRunnerCommitMessage } from "../../../src/runner/commit.ts";
import { contextWithRunnerFakes } from "./context.ts";

describe("composeRunnerCommitMessage", () => {
	test("subject plus step trailer", () => {
		expect(
			composeRunnerCommitMessage({
				subject: "Implement demo slice",
				slug: "demo-objective",
				mode: "default",
			}),
		).toBe("Implement demo slice\n\nObjective-Runner-Step: demo-objective");
	});

	test("body sits between subject and trailers", () => {
		expect(
			composeRunnerCommitMessage({
				subject: "Implement demo slice",
				body: "Introduce the widget\nCover it with tests",
				slug: "demo-objective",
				mode: "default",
			}),
		).toBe(
			[
				"Implement demo slice",
				"",
				"Introduce the widget",
				"Cover it with tests",
				"",
				"Objective-Runner-Step: demo-objective",
			].join("\n"),
		);
	});

	test("recover mode adds the mode trailer", () => {
		expect(
			composeRunnerCommitMessage({
				subject: "Repair demo slice",
				slug: "demo-objective",
				mode: "recover",
			}),
		).toBe(
			[
				"Repair demo slice",
				"",
				"Objective-Runner-Step: demo-objective",
				"Objective-Runner-Mode: recover",
			].join("\n"),
		);
	});
});

describe("commitRunnerStep", () => {
	test("stages the gate-attested paths and commits with the composed message", async () => {
		const ctx = contextWithRunnerFakes({ git: { commitSha: "abc123" } });

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "default",
			subject: "Implement demo slice",
			body: "One body line",
			changedPaths: ["src/a.ts", "src/b.ts"],
		});

		expect(result).toEqual({
			type: "ok",
			commitSha: "abc123",
			message: "Implement demo slice\n\nOne body line\n\nObjective-Runner-Step: demo-objective",
		});
		expect(ctx.git.stagePathsCalls).toEqual([{ cwd: "/repo", paths: ["src/a.ts", "src/b.ts"] }]);
		expect(ctx.git.commitCalls).toEqual([
			{
				cwd: "/repo",
				message: "Implement demo slice\n\nOne body line\n\nObjective-Runner-Step: demo-objective",
			},
		]);
	});

	test("returns the staging error without committing", async () => {
		const ctx = contextWithRunnerFakes({
			git: { stagePathsFailure: { code: "git_stage_paths_failed", message: "boom" } },
		});

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "default",
			subject: "Implement demo slice",
			changedPaths: ["src/a.ts"],
		});

		expect(result).toEqual({ type: "error", code: "git_stage_paths_failed", message: "boom" });
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("refuses an empty changed-path list via the gateway", async () => {
		const ctx = contextWithRunnerFakes();

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "default",
			subject: "Implement demo slice",
			changedPaths: [],
		});

		expect(result.type).toBe("error");
		expect(ctx.git.commitCalls).toEqual([]);
	});

	test("returns the commit error", async () => {
		const ctx = contextWithRunnerFakes({
			git: { commitFailure: { code: "git_commit_failed", message: "hook rejected" } },
		});

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "recover",
			subject: "Repair demo slice",
			changedPaths: ["src/a.ts"],
		});

		expect(result).toEqual({ type: "error", code: "git_commit_failed", message: "hook rejected" });
	});
});
