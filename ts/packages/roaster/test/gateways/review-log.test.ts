import type { CommandExecApi, ExecOptions } from "@sdl/core/command";
import { ScriptedCommandExecApi } from "@sdl/exec/testing";
import { describe, expect, test } from "vitest";

import { RealReviewLogGateway } from "../../src/gateways/review-log.ts";

const scope = { cwd: "/repo", env: { PATH: "/bin" } };

interface ExecCall {
	readonly command: string;
	readonly args: readonly string[];
	readonly options?: ExecOptions | undefined;
}

class EchoPutCommandExecApi implements CommandExecApi {
	private readonly callsInternal: ExecCall[] = [];

	async exec(command: string, args: string[], options?: ExecOptions) {
		this.callsInternal.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options: { ...options } }),
		});
		const sourceFile = args[args.indexOf("--file") + 1] ?? "";
		return {
			code: 0,
			killed: false,
			stderr: "",
			stdout: JSON.stringify({
				exitCode: 0,
				data: {
					namespace: "roaster",
					key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
					branch: "feature",
					refName:
						"refs/brmem/ns/roaster/feature:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
					commit: "abc123",
					sourceFile,
				},
			}),
		};
	}

	calls(): readonly ExecCall[] {
		return this.callsInternal.map((call) => ({
			command: call.command,
			args: [...call.args],
			...(call.options === undefined ? {} : { options: { ...call.options } }),
		}));
	}
}

describe("RealReviewLogGateway", () => {
	test("writes review logs through brmem put", async () => {
		const execApi = new EchoPutCommandExecApi();
		const gateway = new RealReviewLogGateway({ execApi });

		const result = await gateway.writeReviewLog({
			...scope,
			reviewKey: "typescript-style",
			ranAt: "2026-06-20T18:42:11.123Z",
			branch: "feature",
			content: "# Review\n",
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("unexpected write failure");
		expect(result.value.key).toBe("reviews/typescript-style/2026-06-20T18-42-11-123Z.md");
		const call = execApi.calls()[0];
		expect(call?.command).toBe("brmem");
		expect(call?.args.slice(0, 7)).toEqual([
			"put",
			"reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
			"--namespace",
			"roaster",
			"--branch",
			"feature",
			"--file",
		]);
		expect(call?.args.slice(-2)).toEqual(["--format", "json"]);
		expect(call?.options?.cwd).toBe("/repo");
	});

	test("lists and filters review logs from brmem list", async () => {
		const execApi = new ScriptedCommandExecApi([
			{
				stdout: JSON.stringify({
					exitCode: 0,
					data: {
						entries: [
							{
								namespace: "roaster",
								key: "reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
								branch: "feature",
								refName:
									"refs/brmem/ns/roaster/feature:reviews/typescript-style/2026-06-20T18-42-11-123Z.md",
							},
							{
								namespace: "roaster",
								key: "reviews/dignified-python-tripwire/2026-06-20T18-40-11-123Z.md",
								branch: "feature",
								refName:
									"refs/brmem/ns/roaster/feature:reviews/dignified-python-tripwire/2026-06-20T18-40-11-123Z.md",
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
		expect(failedWrite.error.type).toBe("review-log-write-failed");

		const envelopeFailure = new RealReviewLogGateway({
			execApi: new ScriptedCommandExecApi([
				{
					code: 1,
					stdout: JSON.stringify({
						exitCode: 1,
						message: "Source file is 2 MiB; Branch Memory Entries are capped at 1 MiB",
					}),
				},
			]),
		});
		const failedEnvelopeWrite = await envelopeFailure.writeReviewLog({
			...scope,
			reviewKey: "typescript-style",
			ranAt: "2026-06-20T18:42:11.123Z",
			content: "# Review\n",
		});
		expect(failedEnvelopeWrite.type).toBe("error");
		if (failedEnvelopeWrite.type !== "error") throw new Error("unexpected success");
		expect(failedEnvelopeWrite.error.message).toContain("Source file is 2 MiB");

		const invalidJson = new RealReviewLogGateway({
			execApi: new ScriptedCommandExecApi([{ stdout: "not json" }]),
		});
		const failedList = await invalidJson.listReviewLogs(scope);
		expect(failedList.type).toBe("error");
		if (failedList.type !== "error") throw new Error("unexpected success");
		expect(failedList.error.type).toBe("review-log-response-invalid");
	});
});
