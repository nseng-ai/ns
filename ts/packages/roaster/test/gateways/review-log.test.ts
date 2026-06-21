import { ScriptedCommandExecApi } from "@sdl/core/testing";
import { describe, expect, test } from "vitest";

import { RealReviewLogGateway } from "../../src/gateways/review-log.ts";

const scope = { cwd: "/repo", env: { PATH: "/bin" } };

describe("RealReviewLogGateway", () => {
	test("writes review logs through brmem put", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify({
					exit_code: 0,
					data: {
						namespace: "roaster",
						key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
						branch: "feature",
						ref_name:
							"refs/brmem/ns/roaster/feature:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
						commit: "abc123",
						source_file: "/tmp/review.md",
					},
				}),
			},
		]);
		const gateway = new RealReviewLogGateway({ execApi });

		const result = await gateway.writeReviewLog({
			...scope,
			reviewKey: "typescript-style",
			ranAt: "2026-06-20T18:42:11.123Z",
			content: "# Review\n",
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("unexpected write failure");
		expect(result.value.key).toBe("reviews/typescript-style/2026-06-20T18-42-11-123Z.md");
		const call = execApi.calls()[0];
		expect(call?.command).toBe("brmem");
		expect(call?.args.slice(0, 5)).toEqual([
			"put",
			"reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
			"--namespace",
			"roaster",
			"--file",
		]);
		expect(call?.args.slice(-2)).toEqual(["--format", "json"]);
		expect(call?.options?.cwd).toBe("/repo");
	});

	test("lists and filters review logs from brmem list", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify({
					exit_code: 0,
					data: {
						entries: [
							{
								namespace: "roaster",
								key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
								branch: "feature",
								ref_name:
									"refs/brmem/ns/roaster/feature:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
							},
							{
								namespace: "roaster",
								key: "reviews/dignified-python/2026-06-20T18-40-11-123Z.md",
								branch: "feature",
								ref_name:
									"refs/brmem/ns/roaster/feature:reviews/dignified-python/2026-06-20T18-40-11-123Z.md",
							},
						],
					},
				}),
			},
		]);
		const gateway = new RealReviewLogGateway({ execApi });

		const result = await gateway.listReviewLogs({ ...scope, reviewKey: "typescript-style" });

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("unexpected list failure");
		expect(result.value.map((entry) => entry.key)).toEqual([
			"reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
		]);
		expect(execApi.calls()[0]?.args).toEqual([
			"list",
			"--namespace",
			"roaster",
			"--format",
			"json",
		]);
	});

	test("maps process and invalid JSON failures", async () => {
		const processFailure = new RealReviewLogGateway({
			execApi: new ScriptedCommandExecApi([{ code: 127, stderr: "brmem missing" }]),
		});
		const failedWrite = await processFailure.writeReviewLog({
			...scope,
			reviewKey: "typescript-style",
			ranAt: "2026-06-20T18:42:11.123Z",
			content: "# Review\n",
		});
		expect(failedWrite.type).toBe("error");
		if (failedWrite.type !== "error") throw new Error("unexpected success");
		expect(failedWrite.error.type).toBe("review_log_write_failed");

		const invalidJson = new RealReviewLogGateway({
			execApi: new ScriptedCommandExecApi([{ stdout: "not json" }]),
		});
		const failedList = await invalidJson.listReviewLogs(scope);
		expect(failedList.type).toBe("error");
		if (failedList.type !== "error") throw new Error("unexpected success");
		expect(failedList.error.type).toBe("review_log_response_invalid");
	});
});
