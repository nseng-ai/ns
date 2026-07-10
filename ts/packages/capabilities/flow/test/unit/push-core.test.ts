import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import type { ExecResult } from "@nseng-ai/foundation/command";

import { runPushCore } from "../../src/ns/commands/push.ts";

describe("flow push core", () => {
	test("dirty gateway state returns dirty and does not push", async () => {
		let pushCalls = 0;
		const git = new InMemoryGitGateway({ dirtyPaths: ["."] });

		const result = await runPushCore({
			git,
			cwd: "/repo",
			push: async () => {
				pushCalls += 1;
				return makeExecResult();
			},
		});

		expect(result).toEqual({ type: "dirty" });
		expect(pushCalls).toBe(0);
		expect(git.hasUncommittedChangesUnderCalls).toEqual([{ cwd: "/repo", relativePath: "." }]);
	});

	test("clean gateway state invokes push once", async () => {
		let pushCalls = 0;
		const pushResult = makeExecResult({ stdout: "Everything up-to-date\n" });

		const result = await runPushCore({
			git: new InMemoryGitGateway(),
			cwd: "/repo",
			push: async () => {
				pushCalls += 1;
				return pushResult;
			},
		});

		expect(result).toEqual({ type: "pushed", result: pushResult });
		expect(pushCalls).toBe(1);
	});

	test("gateway failure returns status failure and does not push", async () => {
		let pushCalls = 0;
		const error = { code: "status_failed", message: "git status failed" };

		const result = await runPushCore({
			git: new InMemoryGitGateway({ dirtyPathFailures: { ".": error } }),
			cwd: "/repo",
			push: async () => {
				pushCalls += 1;
				return makeExecResult();
			},
		});

		expect(result).toEqual({ type: "status-failed", error });
		expect(pushCalls).toBe(0);
	});
});

interface ExitedResultFields {
	stdout?: string;
	stderr?: string;
	code?: number | null;
	signal?: string | null;
}

function makeExecResult(overrides: ExitedResultFields = {}): ExecResult {
	return {
		type: "exited",
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		signal: overrides.signal ?? null,
	};
}
