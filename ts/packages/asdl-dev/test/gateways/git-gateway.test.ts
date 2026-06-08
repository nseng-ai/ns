import { describe, expect, test } from "vitest";

import { RealGitGateway } from "asdl-dev/src/gateways/git.ts";
import { ScriptedCommandRunner, startupErrorStep, step } from "../support/scripted-command-runner.ts";

describe("RealGitGateway", () => {
	test("currentBranch invokes git branch --show-current", async () => {
		const runner = new ScriptedCommandRunner([step("git", ["branch", "--show-current"], "feature/demo\n")]);
		const gateway = new RealGitGateway(runner.runner);

		expect(await gateway.currentBranch({ cwd: "/repo" })).toEqual({ ok: true, value: "feature/demo" });
		expect(runner.calls).toEqual([{ command: "git", args: ["branch", "--show-current"], cwd: "/repo" }]);
		runner.assertDone();
	});

	test("currentBranch maps blank output to detached_head", async () => {
		const runner = new ScriptedCommandRunner([step("git", ["branch", "--show-current"], "\n")]);
		const gateway = new RealGitGateway(runner.runner);

		const result = await gateway.currentBranch({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error.code).toBe("detached_head");
		runner.assertDone();
	});

	test("currentBranch maps command failure details", async () => {
		const runner = new ScriptedCommandRunner([step("git", ["branch", "--show-current"], "", 1, "not a git repo")]);
		const gateway = new RealGitGateway(runner.runner);

		const result = await gateway.currentBranch({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error).toMatchObject({
			code: "branch_unresolved",
			message: "Could not resolve the current git branch.",
			details: {
				command: "git",
				args: ["branch", "--show-current"],
				exit_code: 1,
				stderr: "not a git repo",
			},
		});
		runner.assertDone();
	});

	test("repoRoot invokes git rev-parse --show-toplevel", async () => {
		const runner = new ScriptedCommandRunner([step("git", ["rev-parse", "--show-toplevel"], "/repo\n")]);
		const gateway = new RealGitGateway(runner.runner);

		expect(await gateway.repoRoot({ cwd: "/work" })).toEqual({ ok: true, value: "/repo" });
		expect(runner.calls).toEqual([{ command: "git", args: ["rev-parse", "--show-toplevel"], cwd: "/work" }]);
		runner.assertDone();
	});

	test("repoRoot maps startup failure", async () => {
		const runner = new ScriptedCommandRunner([startupErrorStep("git", ["rev-parse", "--show-toplevel"], "spawn git ENOENT")]);
		const gateway = new RealGitGateway(runner.runner);

		const result = await gateway.repoRoot({ cwd: "/work" });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error).toMatchObject({
			code: "repo_root_unresolved",
			details: {
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				exit_code: 127,
				startup_error: "spawn git ENOENT",
			},
		});
		runner.assertDone();
	});
});
