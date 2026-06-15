import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { FakeRoasterGitHubGateway, RealRoasterGitHubGateway } from "../../src/gateways/github.ts";
import type { PRChangedFile, PRInlineCommentInput, PRReviewComment } from "../../src/models.ts";
import { ScriptedCommandExecApi } from "../support/fake-roaster-context.ts";

describe("FakeRoasterGitHubGateway", () => {
	test("returns configured state, records batched reviews, and manages discussion comments", async () => {
		const changedFiles: readonly PRChangedFile[] = [{ path: "src/app.ts", status: "modified", patch: "@@ -1 +1 @@\n+new\n" }];
		const reviewComments: readonly PRReviewComment[] = [{ author: "github-actions[bot]", body: "<!-- roaster-inline:review:abc -->" }];
		const gateway = new FakeRoasterGitHubGateway({
			changedFilesByPr: new Map([[7, changedFiles]]),
			reviewCommentsByPr: new Map([[7, reviewComments]]),
			discussionCommentsByPr: new Map([[7, [{ id: 10, body: "<!-- roaster:review -->\nold", author: "github-actions[bot]" }]]]),
		});

		expect(await gateway.getPrChangedFiles(7, { cwd: "/repo" })).toEqual({ type: "ok", value: changedFiles });
		expect(await gateway.getPrReviewComments(7, { cwd: "/repo" })).toEqual({ type: "ok", value: reviewComments });
		const inlineComments: readonly PRInlineCommentInput[] = [{ path: "src/app.ts", line: 1, body: "inline" }];
		expect((await gateway.createPrReview(7, inlineComments, { cwd: "/repo" })).type).toBe("ok");
		expect(gateway.createdReviews()).toEqual([{ prNumber: 7, comments: inlineComments }]);
		expect(await gateway.findPrDiscussionCommentByMarker(7, "<!-- roaster:review -->", "github-actions[bot]", { cwd: "/repo" })).toEqual({ type: "ok", value: { id: 10, body: "<!-- roaster:review -->\nold" } });
		const added = await gateway.addPrDiscussionComment(7, "new", { cwd: "/repo" });
		expect(added.type).toBe("ok");
		if (added.type === "ok") expect(await gateway.updatePrDiscussionComment(added.value.id, "updated", { cwd: "/repo" })).toEqual({ type: "ok", value: { id: added.value.id, body: "updated" } });
	});
});

describe("RealRoasterGitHubGateway", () => {
	test("fetches changed files with nullable patches", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: JSON.stringify([{ filename: "src/app.ts", status: "modified", patch: "@@" }, { filename: "image.png", status: "added" }]) }]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.getPrChangedFiles(12, { cwd: "/repo" });

		expect(result).toEqual({ type: "ok", value: [{ path: "src/app.ts", status: "modified", patch: "@@" }, { path: "image.png", status: "added", patch: null }] });
		expect(execApi.calls()[0]?.args).toEqual(["api", "--paginate", "repos/{owner}/{repo}/pulls/12/files"]);
	});

	test("fetches review comments and normalizes author login forms", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: JSON.stringify([{ user: { login: "octocat" }, body: "body" }, { author: "bot", body: "other" }]) }]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.getPrReviewComments(12, { cwd: "/repo" });

		expect(result).toEqual({ type: "ok", value: [{ author: "octocat", body: "body" }, { author: "bot", body: "other" }] });
		expect(execApi.calls()[0]?.args).toEqual(["api", "--paginate", "repos/{owner}/{repo}/pulls/12/comments"]);
	});

	test("creates one batched PR review with JSON input", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: "{}" }]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.createPrReview(12, [{ path: "src/app.ts", line: 4, body: "inline" }], { cwd: "/repo" });

		expect(result.type).toBe("ok");
		const call = execApi.calls()[0];
		expect(call?.args.slice(0, 5)).toEqual(["api", "--method", "POST", "repos/{owner}/{repo}/pulls/12/reviews", "--input"]);
		const inputPath = call?.args[5];
		expect(inputPath).toBeDefined();
		if (inputPath !== undefined) {
			expect(JSON.parse(await readFile(inputPath, "utf8"))).toEqual({ event: "COMMENT", comments: [{ path: "src/app.ts", line: 4, body: "inline" }] });
		}
	});

	test("finds discussion comments by marker and author", async () => {
		const execApi = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify([{ id: 1, user: { login: "human" }, body: "<!-- roaster:review -->" }, { id: 2, user: { login: "github-actions[bot]" }, body: "prefix <!-- roaster:review -->" }]) },
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.findPrDiscussionCommentByMarker(12, "<!-- roaster:review -->", "github-actions[bot]", { cwd: "/repo" });

		expect(result).toEqual({ type: "ok", value: { id: 2, body: "prefix <!-- roaster:review -->" } });
		expect(execApi.calls()[0]?.args).toEqual(["api", "--paginate", "repos/{owner}/{repo}/issues/12/comments"]);
	});

	test("adds and updates issue discussion comments", async () => {
		const execApi = new ScriptedCommandExecApi([{ stdout: JSON.stringify({ id: 11, body: "created" }) }, { stdout: JSON.stringify({ id: 11, body: "updated" }) }]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		expect(await gateway.addPrDiscussionComment(12, "created", { cwd: "/repo" })).toEqual({ type: "ok", value: { id: 11, body: "created" } });
		expect(await gateway.updatePrDiscussionComment(11, "updated", { cwd: "/repo" })).toEqual({ type: "ok", value: { id: 11, body: "updated" } });
		expect(execApi.calls()[0]?.args).toEqual(["api", "--method", "POST", "repos/{owner}/{repo}/issues/12/comments", "-f", "body=created"]);
		expect(execApi.calls()[1]?.args).toEqual(["api", "--method", "PATCH", "repos/{owner}/{repo}/issues/comments/11", "-f", "body=updated"]);
	});

	test("returns typed failures for gh and JSON errors", async () => {
		const failedExec = new ScriptedCommandExecApi([{ stderr: "no auth", code: 1 }]);
		const badJsonExec = new ScriptedCommandExecApi([{ stdout: "not json" }]);

		const ghFailure = await new RealRoasterGitHubGateway(failedExec).getPrChangedFiles(12, { cwd: "/repo" });
		const jsonFailure = await new RealRoasterGitHubGateway(badJsonExec).getPrChangedFiles(12, { cwd: "/repo" });

		expect(ghFailure.type).toBe("error");
		if (ghFailure.type === "error") expect(ghFailure.error.type).toBe("github_cli_failed");
		expect(jsonFailure.type).toBe("error");
		if (jsonFailure.type === "error") expect(jsonFailure.error.type).toBe("github_json_invalid");
	});
});
