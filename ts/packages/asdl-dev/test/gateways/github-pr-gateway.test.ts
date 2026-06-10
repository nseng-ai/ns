import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import type { CommandRunner } from "@asdl/core/exec";
import { RealGithubPrGateway } from "asdl-dev/src/gateways/github-pr.ts";
import { ScriptedCommandRunner, step } from "../support/scripted-command-runner.ts";

describe("RealGithubPrGateway", () => {
	test("lists open PR numbers with an explicit limit", async () => {
		const runner = new ScriptedCommandRunner([step("gh", ["pr", "list", "--state", "open", "--json", "number", "--limit", "1000"], '[{"number":12}]\n')]);
		const gateway = new RealGithubPrGateway(runner.runner);

		expect(await gateway.listOpenPrNumbers({ cwd: "/repo" })).toEqual({ ok: true, value: [12] });
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
});
