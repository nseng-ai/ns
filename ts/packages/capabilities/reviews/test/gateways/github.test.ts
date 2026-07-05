import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import type { GithubPrReviewThread } from "@nseng-ai/capability-kit/github/pr-feedback";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { ScriptedCommandExecApi } from "@nseng-ai/foundation/exec/testing";

import { FakeRoasterGitHubGateway, RealRoasterGitHubGateway } from "../../src/gateways/github.ts";
import type {
	PRChangedFile,
	PRInlineCommentInput,
	PRReviewComment,
} from "../../src/core/models.ts";

describe("FakeRoasterGitHubGateway", () => {
	test("returns configured state, records batched reviews, and manages discussion comments", async () => {
		const changedFiles: readonly PRChangedFile[] = [
			{ path: "src/app.ts", status: "modified", patch: "@@ -1 +1 @@\n+new\n" },
		];
		const reviewComments: readonly PRReviewComment[] = [
			{ author: "github-actions[bot]", body: "<!-- roaster-inline:review:abc -->" },
		];
		const reviewThreads: readonly GithubPrReviewThread[] = [
			{
				id: "thread-1",
				path: "src/app.ts",
				line: 1,
				startLine: null,
				isResolved: false,
				isOutdated: false,
				comments: [
					{
						id: 20,
						body: "<!-- roaster-inline:review:abc -->",
						author: "github-actions[bot]",
						path: "src/app.ts",
						line: 1,
						startLine: null,
						createdAt: "2026-01-01T00:00:00Z",
					},
				],
			},
		];
		const gateway = new FakeRoasterGitHubGateway({
			changedFilesByPr: new Map([[7, changedFiles]]),
			reviewCommentsByPr: new Map([[7, reviewComments]]),
			reviewThreadsByPr: new Map([[7, reviewThreads]]),
			discussionCommentsByPr: new Map([
				[7, [{ id: 10, body: "<!-- roaster:review -->\nold", author: "github-actions[bot]" }]],
			]),
		});

		expect(await gateway.getPrChangedFiles(7, { cwd: "/repo" })).toEqual({
			type: "ok",
			value: changedFiles,
		});
		expect(await gateway.getPrReviewComments(7, { cwd: "/repo" })).toEqual({
			type: "ok",
			value: reviewComments,
		});
		expect(await gateway.getPrReviewThreads(7, { cwd: "/repo" })).toEqual({
			type: "ok",
			value: reviewThreads,
		});
		expect(gateway.reviewThreadCalls()).toEqual([{ cwd: "/repo", prNumber: 7 }]);
		const inlineComments: readonly PRInlineCommentInput[] = [
			{ path: "src/app.ts", line: 1, body: "inline" },
		];
		expect((await gateway.createPrReview(7, inlineComments, { cwd: "/repo" })).type).toBe("ok");
		expect(gateway.createdReviews()).toEqual([{ prNumber: 7, comments: inlineComments }]);
		expect(
			await gateway.findPrDiscussionCommentByMarker({
				prNumber: 7,
				marker: "<!-- roaster:review -->",
				authorLogin: "github-actions[bot]",
				cwd: "/repo",
			}),
		).toEqual({ type: "ok", value: { id: 10, body: "<!-- roaster:review -->\nold" } });
		const added = await gateway.addPrDiscussionComment(7, "new", { cwd: "/repo" });
		expect(added.type).toBe("ok");
		if (added.type === "ok")
			expect(
				await gateway.updatePrDiscussionComment(added.value.id, "updated", { cwd: "/repo" }),
			).toEqual({ type: "ok", value: { id: added.value.id, body: "updated" } });
	});
});

describe("RealRoasterGitHubGateway", () => {
	test("fetches changed files with nullable patches", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify([
					{ filename: "src/app.ts", status: "modified", patch: "@@" },
					{ filename: "image.png", status: "added" },
				]),
			},
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.getPrChangedFiles(12, { cwd: "/repo" });

		expect(result).toEqual({
			type: "ok",
			value: [
				{ path: "src/app.ts", status: "modified", patch: "@@" },
				{ path: "image.png", status: "added", patch: null },
			],
		});
		expect(execApi.calls()[0]?.args).toEqual([
			"api",
			"--paginate",
			"repos/{owner}/{repo}/pulls/12/files",
		]);
	});

	test("fetches review comments and normalizes author login forms", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify([
					{ user: { login: "octocat" }, body: "body" },
					{ author: "bot", body: "other" },
					{ author: {}, body: "missing login" },
				]),
			},
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.getPrReviewComments(12, { cwd: "/repo" });

		expect(result).toEqual({
			type: "ok",
			value: [
				{ author: "octocat", body: "body" },
				{ author: "bot", body: "other" },
				{ author: "", body: "missing login" },
			],
		});
		expect(execApi.calls()[0]?.args).toEqual([
			"api",
			"--paginate",
			"repos/{owner}/{repo}/pulls/12/comments",
		]);
	});

	test("creates one batched PR review with JSON input and removes the temporary file", async () => {
		const execApi = new CapturingInputExecApi();
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.createPrReview(
			12,
			[{ path: "src/app.ts", line: 4, body: "inline" }],
			{ cwd: "/repo" },
		);

		expect(result.type).toBe("ok");
		const call = execApi.calls()[0];
		expect(call?.args.slice(0, 5)).toEqual([
			"api",
			"--method",
			"POST",
			"repos/{owner}/{repo}/pulls/12/reviews",
			"--input",
		]);
		expect(execApi.capturedInput()).toEqual({
			event: "COMMENT",
			comments: [{ path: "src/app.ts", line: 4, body: "inline" }],
		});
		const inputPath = call?.args[5];
		expect(inputPath).toBeDefined();
		if (inputPath !== undefined) await expect(readFile(inputPath, "utf8")).rejects.toThrow();
	});

	test("finds discussion comments by marker and author", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify([
					{ id: 1, user: { login: "human" }, body: "<!-- roaster:review -->" },
					{ id: 2, user: { login: "github-actions[bot]" }, body: "prefix <!-- roaster:review -->" },
				]),
			},
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.findPrDiscussionCommentByMarker({
			prNumber: 12,
			marker: "<!-- roaster:review -->",
			authorLogin: "github-actions[bot]",
			cwd: "/repo",
		});

		expect(result).toEqual({
			type: "ok",
			value: { id: 2, body: "prefix <!-- roaster:review -->" },
		});
		expect(execApi.calls()[0]?.args).toEqual([
			"api",
			"--paginate",
			"repos/{owner}/{repo}/issues/12/comments",
		]);
	});

	test("accepts positive numeric string ids in discussion comments", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify([
					{
						id: "42",
						user: { login: "github-actions[bot]" },
						body: "prefix <!-- roaster:review -->",
					},
				]),
			},
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		const result = await gateway.findPrDiscussionCommentByMarker({
			prNumber: 12,
			marker: "<!-- roaster:review -->",
			authorLogin: "github-actions[bot]",
			cwd: "/repo",
		});

		expect(result).toEqual({
			type: "ok",
			value: { id: 42, body: "prefix <!-- roaster:review -->" },
		});
	});

	test("rejects invalid ids in listed discussion comments", async () => {
		const invalidComments = [
			{ label: "missing", comment: { user: { login: "github-actions[bot]" }, body: "body" } },
			{
				label: "non-numeric",
				comment: { id: "abc", user: { login: "github-actions[bot]" }, body: "body" },
			},
			{ label: "zero", comment: { id: 0, user: { login: "github-actions[bot]" }, body: "body" } },
			{
				label: "negative",
				comment: { id: -1, user: { login: "github-actions[bot]" }, body: "body" },
			},
		];

		for (const invalid of invalidComments) {
			const execApi = new ScriptedCommandExecApi([{ stdout: JSON.stringify([invalid.comment]) }]);
			const gateway = new RealRoasterGitHubGateway(execApi);

			const result = await gateway.findPrDiscussionCommentByMarker({
				prNumber: 12,
				marker: "body",
				authorLogin: "github-actions[bot]",
				cwd: "/repo",
			});

			expect(result.type, invalid.label).toBe("error");
			if (result.type === "error") expect(result.error.type).toBe("github-response-invalid");
		}
	});

	test("adds and updates issue discussion comments", async () => {
		const execApi = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify({ id: 11, body: "created" }) },
			{ stdout: JSON.stringify({ id: 11, body: "updated" }) },
		]);
		const gateway = new RealRoasterGitHubGateway(execApi);

		expect(await gateway.addPrDiscussionComment(12, "created", { cwd: "/repo" })).toEqual({
			type: "ok",
			value: { id: 11, body: "created" },
		});
		expect(await gateway.updatePrDiscussionComment(11, "updated", { cwd: "/repo" })).toEqual({
			type: "ok",
			value: { id: 11, body: "updated" },
		});
		expect(execApi.calls()[0]?.args).toEqual([
			"api",
			"--method",
			"POST",
			"repos/{owner}/{repo}/issues/12/comments",
			"-f",
			"body=created",
		]);
		expect(execApi.calls()[1]?.args).toEqual([
			"api",
			"--method",
			"PATCH",
			"repos/{owner}/{repo}/issues/comments/11",
			"-f",
			"body=updated",
		]);
	});

	test("rejects invalid ids in discussion comment mutations", async () => {
		const invalidComments = [
			{ label: "missing", comment: { body: "body" } },
			{ label: "non-numeric", comment: { id: "abc", body: "body" } },
			{ label: "zero", comment: { id: 0, body: "body" } },
			{ label: "negative", comment: { id: -1, body: "body" } },
		];

		for (const invalid of invalidComments) {
			const addGateway = new RealRoasterGitHubGateway(
				new ScriptedCommandExecApi([{ stdout: JSON.stringify(invalid.comment) }]),
			);
			const addResult = await addGateway.addPrDiscussionComment(12, "created", { cwd: "/repo" });
			expect(addResult.type, `add ${invalid.label}`).toBe("error");
			if (addResult.type === "error") expect(addResult.error.type).toBe("github-response-invalid");

			const updateGateway = new RealRoasterGitHubGateway(
				new ScriptedCommandExecApi([{ stdout: JSON.stringify(invalid.comment) }]),
			);
			const updateResult = await updateGateway.updatePrDiscussionComment(11, "updated", {
				cwd: "/repo",
			});
			expect(updateResult.type, `update ${invalid.label}`).toBe("error");
			if (updateResult.type === "error")
				expect(updateResult.error.type).toBe("github-response-invalid");
		}
	});

	test("returns self-contained typed failures for gh and JSON errors", async () => {
		const failedExec = new ScriptedCommandExecApi([{ stderr: "no auth", code: 1 }]);
		const badJsonExec = new ScriptedCommandExecApi([{ stdout: "not json" }]);
		const badShapeExec = new ScriptedCommandExecApi([
			{ stdout: JSON.stringify({ not: "a list" }) },
		]);

		const ghFailure = await new RealRoasterGitHubGateway(failedExec).getPrChangedFiles(12, {
			cwd: "/repo",
		});
		const jsonFailure = await new RealRoasterGitHubGateway(badJsonExec).getPrChangedFiles(12, {
			cwd: "/repo",
		});
		const shapeFailure = await new RealRoasterGitHubGateway(badShapeExec).getPrChangedFiles(12, {
			cwd: "/repo",
		});

		expect(ghFailure.type).toBe("error");
		if (ghFailure.type === "error") {
			expect(ghFailure.error.type).toBe("github-cli-failed");
			expect(ghFailure.error.message).toContain("gh api --paginate");
			expect(ghFailure.error.message).toContain("/repo");
			expect(ghFailure.error.message).toContain("no auth");
		}
		expect(jsonFailure.type).toBe("error");
		if (jsonFailure.type === "error") {
			expect(jsonFailure.error.type).toBe("github-json-invalid");
			expect(jsonFailure.error.message).toContain("list PR changed files");
			expect(jsonFailure.error.message).toContain("not valid JSON");
		}
		expect(shapeFailure.type).toBe("error");
		if (shapeFailure.type === "error") {
			expect(shapeFailure.error.type).toBe("github-response-invalid");
			expect(shapeFailure.error.message).toContain("list PR changed files");
			expect(shapeFailure.error.message).toContain("expected shape");
		}
	});
});

class CapturingInputExecApi implements CommandExecApi {
	private readonly callsInternal: Array<{
		readonly command: string;
		readonly args: readonly string[];
		readonly options?: ExecOptions;
	}> = [];
	private capturedInputInternal: unknown;

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.callsInternal.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
		const inputPath = args[5];
		if (typeof inputPath === "string")
			this.capturedInputInternal = JSON.parse(await readFile(inputPath, "utf8"));
		return { stdout: "{}", stderr: "", code: 0, killed: false };
	}

	calls(): ReadonlyArray<{
		readonly command: string;
		readonly args: readonly string[];
		readonly options?: ExecOptions;
	}> {
		return this.callsInternal.map((call) => ({ ...call, args: [...call.args] }));
	}

	capturedInput(): unknown {
		return this.capturedInputInternal;
	}
}
