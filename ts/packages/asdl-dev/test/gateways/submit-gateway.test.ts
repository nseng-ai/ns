import { describe, expect, test } from "bun:test";

import { RealSubmitGateway } from "../../src/submit.ts";
import { ScriptedCommandRunner, step } from "../support/scripted-command-runner.ts";

describe("RealSubmitGateway", () => {
	test("checkSubmitReadiness invokes Graphite dry-run submit", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["submit", "-nps", "--ai", "--dry-run"], "ok\n")]);
		const gateway = new RealSubmitGateway(runner.runner);

		expect(await gateway.checkSubmitReadiness({ cwd: "/repo" })).toMatchObject({ kind: "ready" });
		expect(runner.calls).toEqual([{ command: "gt", args: ["submit", "-nps", "--ai", "--dry-run"], cwd: "/repo" }]);
		runner.assertDone();
	});

	test("checkSubmitReadiness maps restack-required dry-run output", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["submit", "-nps", "--ai", "--dry-run"], "", 1, "This stack must be restacked before submitting.\n"),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.checkSubmitReadiness({ cwd: "/repo" });

		expect(result.kind).toBe("restack_required");
		runner.assertDone();
	});

	test("restackCurrentStack reports conflicts from git conflict facts", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["restack", "--no-interactive"], "", 1, "CONFLICT (content): merge conflict\n"),
			step("git", ["diff", "--name-only", "--diff-filter=U"], "src/app.ts\n"),
			step("git", ["status", "--porcelain"], "UU src/app.ts\n"),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.restackCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "conflict", conflictedFiles: ["src/app.ts"] });
		expect(runner.calls.map((call) => call.command)).toEqual(["gt", "git", "git"]);
		runner.assertDone();
	});

	test("submitCurrentStack extracts PR links from submit output", async () => {
		const runner = new ScriptedCommandRunner([
			step("gt", ["submit", "-nps", "--ai"], "Created https://github.com/acme/project/pull/456\n"),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			prLinks: [{ label: "#456", url: "https://github.com/acme/project/pull/456" }],
		});
		runner.assertDone();
	});

	test("submitCurrentStack preserves semantic empty-branch failure from zero-exit output", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gt",
				["submit", "-nps", "--ai"],
				"This branch does not introduce any changes:\nGraphite will not be submitted because GitHub does not allow empty PRs.\n",
			),
		]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.submitCurrentStack({ cwd: "/repo" });

		expect(result).toMatchObject({
			kind: "success",
			semanticFailure: "gt submit exited 0, but Graphite skipped submitting part of the stack because a branch is empty.",
		});
		runner.assertDone();
	});

	test("verifyCurrentPr maps Graphite no-PR output", async () => {
		const runner = new ScriptedCommandRunner([step("gt", ["pr"], "", 1, "No PR found for current branch.\n")]);
		const gateway = new RealSubmitGateway(runner.runner);

		const result = await gateway.verifyCurrentPr({ cwd: "/repo" });

		expect(result).toMatchObject({ kind: "no_current_pr" });
		runner.assertDone();
	});
});
