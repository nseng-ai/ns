import type { CommandRunner, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

import {
	createRealDispatchWorkspaceGitGateway,
	parseGitLsRemoteSha,
	parseGitPorcelainStatusPaths,
} from "../../src/ns/dispatch-prompt/real-workspace-git-gateway.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";

function exited(overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {}): ExecResult {
	return { type: "exited", stdout: "", stderr: "", code: 0, signal: null, ...overrides };
}

function scriptedRunner(responses: readonly ExecResult[]) {
	const calls: { command: string; args: readonly string[] }[] = [];
	let index = 0;
	const runner: CommandRunner = async (command, args) => {
		calls.push({ command, args: [...args] });
		const response = responses[index] ?? responses[responses.length - 1];
		index += 1;
		return response ?? exited();
	};
	return { runner, calls };
}

describe("workspace git wire parsers", () => {
	test("parses porcelain status paths including renames", () => {
		const paths = parseGitPorcelainStatusPaths(
			" M src/widget.ts\n?? notes.md\nR  old.ts -> new.ts\n",
		);
		expect(paths).toEqual(["src/widget.ts", "notes.md", "old.ts -> new.ts"]);
	});

	test("parses ls-remote output to a lowercase sha or null", () => {
		expect(parseGitLsRemoteSha(`${SHA.toUpperCase()}\trefs/heads/feature\n`)).toBe(SHA);
		expect(parseGitLsRemoteSha("")).toBeNull();
		expect(parseGitLsRemoteSha("not-a-sha\trefs/heads/feature\n")).toBeNull();
	});
});

describe("real workspace git gateway", () => {
	test("resolves the source ref from rev-parse calls", async () => {
		const { runner, calls } = scriptedRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "feature/widgets\n" }),
			exited({ stdout: `${SHA.toUpperCase()}\n` }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.resolveSourceRef({ cwd: "/repo/sub" });

		expect(result).toEqual({
			ok: true,
			value: { repoRoot: "/repo", branch: "feature/widgets", headSha: SHA },
		});
		expect(calls.map((call) => call.args.join(" "))).toEqual([
			"rev-parse --show-toplevel",
			"rev-parse --abbrev-ref HEAD",
			"rev-parse HEAD",
		]);
	});

	test("classifies a detached HEAD", async () => {
		const { runner } = scriptedRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "HEAD\n" }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.resolveSourceRef({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("detached-head");
	});

	test("pushes the anchor ref as revision:refs/heads/branch", async () => {
		const { runner, calls } = scriptedRunner([exited()]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.pushAnchorBranch({
			cwd: "/repo",
			revision: SHA,
			anchorBranch: "dispatch/feature-widgets-ab12cd34",
		});

		expect(result.ok).toBe(true);
		expect(calls[0]?.args).toEqual([
			"push",
			"origin",
			`${SHA}:refs/heads/dispatch/feature-widgets-ab12cd34`,
		]);
	});

	test("surfaces push failures with the first stderr line", async () => {
		const { runner } = scriptedRunner([
			exited({ code: 1, stderr: "error: failed to push some refs\nhint: ..." }),
		]);
		const gateway = createRealDispatchWorkspaceGitGateway(runner);
		const result = await gateway.pushSourceBranch({ cwd: "/repo", branch: "feature/widgets" });

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("failed to push some refs");
			expect(result.error.message).not.toContain("hint:");
		}
	});
});
