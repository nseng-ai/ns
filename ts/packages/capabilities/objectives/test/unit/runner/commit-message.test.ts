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
	test("commits the already-prepared candidate with the composed message", async () => {
		const ctx = contextWithRunnerFakes({ git: { commitSha: "abc123" } });

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "default",
			subject: "Implement demo slice",
			body: "One body line",
		});

		expect(result).toEqual({
			type: "ok",
			commitSha: "abc123",
			message: "Implement demo slice\n\nOne body line\n\nObjective-Runner-Step: demo-objective",
		});
		expect(ctx.git.stagePathsCalls).toEqual([]);
		expect(ctx.git.commitCalls).toEqual([
			{
				cwd: "/repo",
				message: "Implement demo slice\n\nOne body line\n\nObjective-Runner-Step: demo-objective",
			},
		]);
	});

	test("returns the commit error", async () => {
		const ctx = contextWithRunnerFakes({
			git: { commitFailure: { code: "git_commit_failed", message: "hook rejected" } },
		});

		const result = await commitRunnerStep(ctx, {
			slug: "demo-objective",
			mode: "recover",
			subject: "Repair demo slice",
		});

		expect(result).toEqual({ type: "error", code: "git_commit_failed", message: "hook rejected" });
	});
});
