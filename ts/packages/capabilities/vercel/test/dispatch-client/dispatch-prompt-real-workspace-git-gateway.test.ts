import { RealGitGateway } from "@nseng-ai/foundation/git";
import { describe, expect, test } from "vitest";

import {
	createRealDispatchWorkspaceGitGateway,
	parseGitLsRemoteSha,
} from "../../src/dispatch-client/real-workspace-git-gateway.ts";
import { exited, ScriptedCommandRunner } from "./support/scripted-command-runner.ts";

const SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678";
const ANCHOR_SHA = "b2c3d4e5f60718293a4b5c6d7e8f9012345678a1";
const ANCHOR_BRANCH = "dispatch/rename-widget-gateway-methods-20260715-071814";

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

	test("pushes the captured source SHA without moving or force-updating a local ref", async () => {
		const commands = new ScriptedCommandRunner([exited()]);
		const result = await createGateway(commands).pushSourceBranch({
			cwd: "/repo",
			branch: "feature/widgets",
			expectedRevision: SHA,
		});

		expect(result.ok).toBe(true);
		expect(commands.calls[0]?.args).toEqual([
			"push",
			"origin",
			`${SHA}:refs/heads/feature/widgets`,
		]);
	});

	test("checks exact remote anchor availability as available or occupied", async () => {
		for (const [stdout, expected] of [
			["", { type: "available" }],
			[`${ANCHOR_SHA}\trefs/heads/${ANCHOR_BRANCH}\n`, { type: "occupied" }],
		] as const) {
			const commands = new ScriptedCommandRunner([exited({ stdout })]);
			const result = await createGateway(commands).isAnchorBranchNameAvailable({
				cwd: "/repo",
				anchorBranch: ANCHOR_BRANCH,
			});

			expect(result).toEqual(expected);
			expect(commands.calls[0]?.args).toEqual([
				"ls-remote",
				"origin",
				`refs/heads/${ANCHOR_BRANCH}`,
			]);
		}
	});

	test("returns a typed anchor availability read failure", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ code: 1, stderr: "fatal: origin unavailable\nhidden follow-up" }),
		]);
		const result = await createGateway(commands).isAnchorBranchNameAvailable({
			cwd: "/repo",
			anchorBranch: ANCHOR_BRANCH,
		});

		expect(result).toEqual({
			type: "error",
			error: {
				code: "git-ls-remote-failed",
				message: `Could not inspect availability of anchor branch ${ANCHOR_BRANCH}: fatal: origin unavailable`,
			},
		});
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
			anchorBranch: ANCHOR_BRANCH,
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
			`${ANCHOR_SHA}:refs/heads/${ANCHOR_BRANCH}`,
		]);
	});

	test("surfaces source push failures with their prefix and first stderr line", async () => {
		const commands = new ScriptedCommandRunner([
			exited({ code: 1, stderr: "error: failed to push source refs\nhint: source hint" }),
		]);
		const result = await createGateway(commands).pushSourceBranch({
			cwd: "/repo",
			branch: "feature/widgets",
			expectedRevision: SHA,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "git-push-failed",
				message: `Pushing exact revision ${SHA} to branch feature/widgets failed: error: failed to push source refs`,
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
			anchorBranch: ANCHOR_BRANCH,
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "git-push-failed",
				message: `Pushing anchor branch ${ANCHOR_BRANCH} failed: error: failed to push anchor ref`,
			},
		});
	});
});
