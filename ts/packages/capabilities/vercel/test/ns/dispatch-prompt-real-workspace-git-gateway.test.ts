import { RealGitGateway } from "@nseng-ai/foundation/git";
import { describe, expect, test } from "vitest";

import {
	createRealDispatchWorkspaceGitGateway,
	parseGitLsRemoteSha,
} from "../../src/ns/dispatch-prompt/real-workspace-git-gateway.ts";
import { exited, ScriptedCommandRunner } from "./support/scripted-command-runner.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const ANCHOR_SHA = "b2c3d4e5f60718293a4b5c6d7e8f9012345678a1";

function createGateway(commands: ScriptedCommandRunner) {
	return createRealDispatchWorkspaceGitGateway(new RealGitGateway(commands), commands.run);
}

describe("workspace git wire parser", () => {
	test("parses ls-remote output to a lowercase sha or null", () => {
		expect(parseGitLsRemoteSha(`${SHA.toUpperCase()}\trefs/heads/feature\n`)).toBe(SHA);
		expect(parseGitLsRemoteSha("")).toBeNull();
		expect(parseGitLsRemoteSha("not-a-sha\trefs/heads/feature\n")).toBeNull();
	});
});

describe("real workspace git gateway", () => {
	test("delegates source facts to Foundation Git", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "feature/widgets\n" }),
			exited({ stdout: `${SHA.toUpperCase()}\n` }),
		]);
		const result = await createGateway(commands).resolveSourceRef({ cwd: "/repo/sub" });

		expect(result).toEqual({
			ok: true,
			value: { repoRoot: "/repo", branch: "feature/widgets", headSha: SHA },
		});
		expect(commands.calls.map((call) => call.args.join(" "))).toEqual([
			"rev-parse --show-toplevel",
			"branch --show-current",
			"rev-parse HEAD",
		]);
	});

	test("classifies a detached HEAD", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ stdout: "/repo\n" }),
			exited({ stdout: "" }),
		]);
		const result = await createGateway(commands).resolveSourceRef({ cwd: "/repo" });

		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe("detached-head");
	});

	test("pushes the source ref as branch:refs/heads/branch", async () => {
		const commands = new ScriptedCommandRunner([exited()]);
		const result = await createGateway(commands).pushSourceBranch({
			cwd: "/repo",
			branch: "feature/widgets",
		});

		expect(result.ok).toBe(true);
		expect(commands.calls[0]?.args).toEqual([
			"push",
			"origin",
			"feature/widgets:refs/heads/feature/widgets",
		]);
	});

	test("uses Foundation NUL parsing for literal paths and rename/copy destinations", async () => {
		const commands = new ScriptedCommandRunner([
			exited({
				stdout: [
					" M literal path.ts",
					"?? résumé notes.md",
					'?? quote"file.txt',
					"R  renamed destination.ts",
					"old source.ts",
					"C  copied destination.ts",
					"copy source.ts",
					"",
				].join("\0"),
			}),
		]);
		const result = await createGateway(commands).listDirtyPaths({ cwd: "/repo" });

		expect(result).toEqual({
			ok: true,
			value: [
				"literal path.ts",
				"résumé notes.md",
				'quote"file.txt',
				"renamed destination.ts",
				"copied destination.ts",
			],
		});
		expect(commands.calls[0]?.args).toEqual(["status", "--porcelain=v1", "-z"]);
	});

	test("maps Foundation status errors into dispatch gateway errors", async () => {
		const commands = new ScriptedCommandRunner([exited({ code: 1, stderr: "bad status" })]);
		const result = await createGateway(commands).listDirtyPaths({ cwd: "/repo" });

		expect(result).toMatchObject({
			ok: false,
			error: { code: "git_status_paths_failed" },
		});
	});

	test("creates a metadata-only anchor commit before pushing the branch", async () => {
		const commands = new ScriptedCommandRunner([exited({ stdout: `${ANCHOR_SHA}\n` }), exited()]);
		const result = await createGateway(commands).pushAnchorBranch({
			cwd: "/repo",
			revision: SHA,
			anchorBranch: "dispatch/feature-widgets-ab12cd34",
		});

		expect(result.ok).toBe(true);
		expect(commands.calls[0]?.args).toEqual([
			"commit-tree",
			`${SHA}^{tree}`,
			"-p",
			SHA,
			"-m",
			"Initialize cloud dispatch anchor",
		]);
		expect(commands.calls[1]?.args).toEqual([
			"push",
			"origin",
			`${ANCHOR_SHA}:refs/heads/dispatch/feature-widgets-ab12cd34`,
		]);
	});

	test("surfaces source push failures with their prefix and first stderr line", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ code: 1, stderr: "error: failed to push source refs\nhint: source hint" }),
		]);
		const result = await createGateway(commands).pushSourceBranch({
			cwd: "/repo",
			branch: "feature/widgets",
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "git-push-failed",
				message: "Pushing branch feature/widgets failed: error: failed to push source refs",
			},
		});
	});

	test("surfaces anchor push failures with their prefix and first stderr line", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ stdout: `${ANCHOR_SHA}\n` }),
			exited({ code: 1, stderr: "error: failed to push anchor ref\nhint: anchor hint" }),
		]);
		const result = await createGateway(commands).pushAnchorBranch({
			cwd: "/repo",
			revision: SHA,
			anchorBranch: "dispatch/feature-widgets-ab12cd34",
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "git-push-failed",
				message:
					"Pushing anchor branch dispatch/feature-widgets-ab12cd34 failed: error: failed to push anchor ref",
			},
		});
	});
});
