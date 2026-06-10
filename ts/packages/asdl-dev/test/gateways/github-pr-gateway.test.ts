import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import type { CommandRunner } from "@asdl/core/exec";
import { RealGithubPrGateway } from "asdl-dev/src/gateways/github-pr.ts";
import { ScriptedCommandRunner, step } from "../support/scripted-command-runner.ts";

describe("RealGithubPrGateway", () => {
	test("returns structured command failures when gh view current branch fails", async () => {
		const args = ["pr", "view", "--json", "number,url,title,body,headRefName,baseRefName"];
		const runner = new ScriptedCommandRunner([step("gh", args, "", 1, "no pull requests found")]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.viewCurrentBranchPr({ cwd: "/repo" })).toEqual({
			ok: false,
			error: {
				code: "github_pr_view_failed",
				message: "Could not read GitHub PR details.",
				details: { command: "gh", args, exit_code: 1, stderr: "no pull requests found" },
			},
		});
		runner.assertDone();
	});

	test("returns structured command failures when gh commit lookup fails", async () => {
		const args = ["pr", "view", "12", "--json", "commits"];
		const runner = new ScriptedCommandRunner([step("gh", args, "", 1, "not found")]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.getPrCommitMessages({ cwd: "/repo", number: 12 })).toEqual({
			ok: false,
			error: {
				code: "github_pr_commits_failed",
				message: "Could not read commit messages for PR #12.",
				details: { command: "gh", args, exit_code: 1, stderr: "not found" },
			},
		});
		runner.assertDone();
	});

	test("returns structured command failures when gh diff fails", async () => {
		const args = ["pr", "diff", "12"];
		const runner = new ScriptedCommandRunner([step("gh", args, "", 1, "diff unavailable")]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.getPrDiff({ cwd: "/repo", number: 12 })).toEqual({
			ok: false,
			error: {
				code: "github_pr_diff_failed",
				message: "Could not read diff for PR #12.",
				details: { command: "gh", args, exit_code: 1, stderr: "diff unavailable" },
			},
		});
		runner.assertDone();
	});

	test("views current branch PR details as JSON", async () => {
		const runner = new ScriptedCommandRunner([
			step(
				"gh",
				["pr", "view", "--json", "number,url,title,body,headRefName,baseRefName"],
				JSON.stringify({ number: 12, url: "https://github.com/acme/project/pull/12", title: "Title", body: "Body", headRefName: "feature/demo", baseRefName: "main" }),
			),
		]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.viewCurrentBranchPr({ cwd: "/repo" })).toMatchObject({ ok: true, value: { number: 12, title: "Title" } });
		runner.assertDone();
	});

	test("reads commit messages and diff for a PR", async () => {
		const runner = new ScriptedCommandRunner([
			step("gh", ["pr", "view", "12", "--json", "commits"], JSON.stringify({ commits: [{ messageHeadline: "Add feature", messageBody: "Body" }] })),
			step("gh", ["pr", "diff", "12"], "diff --git a/src/app.ts b/src/app.ts\n+code\n"),
		]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.getPrCommitMessages({ cwd: "/repo", number: 12 })).toEqual({ ok: true, value: [{ headline: "Add feature", body: "Body" }] });
		expect(await gateway.getPrDiff({ cwd: "/repo", number: 12 })).toEqual({ ok: true, value: "diff --git a/src/app.ts b/src/app.ts\n+code\n" });
		runner.assertDone();
	});

	test("edits PR body through a temporary body file", async () => {
		const calls: Array<{ command: string; args: string[]; cwd?: string; bodyFileText?: string }> = [];
		const runner: CommandRunner = async (command, args, options = {}) => {
			const bodyFileIndex = args.indexOf("--body-file");
			const bodyFile = bodyFileIndex === -1 ? undefined : args[bodyFileIndex + 1];
			calls.push({
				command,
				args: [...args],
				...(options.cwd === undefined ? {} : { cwd: options.cwd }),
				...(bodyFile === undefined ? {} : { bodyFileText: await readFile(bodyFile, "utf8") }),
			});
			return { stdout: "", stderr: "", code: 0, killed: false };
		};
		const gateway = new RealGithubPrGateway(runner);

		expect(await gateway.editPr({ cwd: "/repo", number: 12, title: "New title", body: "New body" })).toEqual({ ok: true, value: undefined });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("gh");
		expect(calls[0]?.args.slice(0, 6)).toEqual(["pr", "edit", "12", "--title", "New title", "--body-file"]);
		expect(calls[0]?.cwd).toBe("/repo");
		expect(calls[0]?.bodyFileText).toBe("New body\n");
	});

	test("returns structured command failures when gh edit fails", async () => {
		const calls: Array<{ command: string; args: string[]; cwd?: string; bodyFileText?: string }> = [];
		const runner: CommandRunner = async (command, args, options = {}) => {
			const bodyFileIndex = args.indexOf("--body-file");
			const bodyFile = bodyFileIndex === -1 ? undefined : args[bodyFileIndex + 1];
			calls.push({
				command,
				args: [...args],
				...(options.cwd === undefined ? {} : { cwd: options.cwd }),
				...(bodyFile === undefined ? {} : { bodyFileText: await readFile(bodyFile, "utf8") }),
			});
			return { stdout: "", stderr: "edit failed", code: 1, killed: false };
		};
		const gateway = new RealGithubPrGateway(runner);

		expect(await gateway.editPr({ cwd: "/repo", number: 12, title: "New title", body: "New body" })).toEqual({
			ok: false,
			error: {
				code: "github_pr_edit_failed",
				message: "Could not update PR #12.",
				details: { command: "gh", args: calls[0]?.args, exit_code: 1, stderr: "edit failed" },
			},
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.args.slice(0, 6)).toEqual(["pr", "edit", "12", "--title", "New title", "--body-file"]);
		expect(calls[0]?.cwd).toBe("/repo");
		expect(calls[0]?.bodyFileText).toBe("New body\n");
	});
});
