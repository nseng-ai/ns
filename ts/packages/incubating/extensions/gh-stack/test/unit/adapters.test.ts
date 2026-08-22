import { describe, expect, test } from "vitest";

import {
	exitedResult,
	ScriptedCommandExecApi,
	spawnFailedResult,
} from "@nseng-ai/foundation/exec/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import {
	RealGhStackInstallationGateway,
	RealGhStackLocalInventoryGateway,
	RealGhStackRemoteInventoryGateway,
	type GhStackStateReader,
} from "../../src/core/gateways/real.ts";

const cwd = "/repo/worktree";
const env = { PATH: "/bin" };

function stateReader(
	result: Awaited<ReturnType<GhStackStateReader["readState"]>>,
): GhStackStateReader {
	return {
		async readState() {
			return result;
		},
	};
}

describe("real gh-stack adapters", () => {
	test("verifies installation and records the exact preflight command", async () => {
		const exec = new ScriptedCommandExecApi([exitedResult({ stdout: "gh stack version 0.1.0\n" })]);
		const result = await new RealGhStackInstallationGateway({
			cwd,
			env,
			exec,
		}).verifyInstallation();
		expect(result).toEqual({ ok: true, version: "gh stack version 0.1.0" });
		expect(exec.calls()).toEqual([
			{ command: "gh", args: ["stack", "--version"], options: { cwd, env, timeout: 15_000 } },
		]);
	});

	test("returns a typed installation failure with bounded sanitized evidence", async () => {
		const token = `ghp_${"a".repeat(1000)}`;
		const exec = new ScriptedCommandExecApi([spawnFailedResult(`cannot run ${token}`)]);
		const result = await new RealGhStackInstallationGateway({
			cwd,
			env,
			exec,
		}).verifyInstallation();
		expect(result).toMatchObject({
			ok: false,
			error: {
				type: "gh-stack-extension-unavailable",
				evidence: { command: "gh stack --version", cwd },
			},
		});
		if (result.ok) throw new Error("expected failure");
		expect(result.error.evidence.summary).not.toContain("ghp_");
		expect(result.error.evidence.summary?.length).toBeLessThanOrEqual(500);
	});

	test("treats a missing local state file as an empty inventory and uses git common dir", async () => {
		const git = new InMemoryGitGateway({ gitCommonDir: "/repo/.git-common" });
		const gateway = new RealGhStackLocalInventoryGateway({
			cwd,
			env,
			exec: new ScriptedCommandExecApi(),
			git,
			stateReader: stateReader({ type: "missing" }),
		});
		await expect(gateway.loadLocalStacks()).resolves.toEqual({ ok: true, value: [] });
		expect(git.gitCommonDirCalls).toEqual([{ cwd }]);
	});

	test("classifies git common-dir failure separately", async () => {
		const git = new InMemoryGitGateway({
			gitCommonDir: {
				type: "failure",
				error: { code: "git_common_dir_failed", message: "not a repo" },
			},
		});
		const result = await new RealGhStackLocalInventoryGateway({
			cwd,
			env,
			exec: new ScriptedCommandExecApi(),
			git,
			stateReader: stateReader({ type: "missing" }),
		}).loadLocalStacks();
		expect(result).toMatchObject({ ok: false, error: { type: "git-repository-unavailable" } });
	});

	test("distinguishes existing-file read and parse failures", async () => {
		const git = new InMemoryGitGateway({ gitCommonDir: "/repo/.git" });
		const base = { cwd, env, exec: new ScriptedCommandExecApi(), git };
		await expect(
			new RealGhStackLocalInventoryGateway({
				...base,
				stateReader: stateReader({ type: "failure", summary: "EACCES secret" }),
			}).loadLocalStacks(),
		).resolves.toMatchObject({ ok: false, error: { type: "gh-stack-state-read-failed" } });
		await expect(
			new RealGhStackLocalInventoryGateway({
				...base,
				stateReader: stateReader({ type: "found", text: "{" }),
			}).loadLocalStacks(),
		).resolves.toMatchObject({ ok: false, error: { type: "gh-stack-state-unsupported" } });
	});

	test("loads, flattens, and parses remote stacks with exact gh api argv", async () => {
		const stdout = JSON.stringify([
			[
				{
					id: 1,
					number: 2,
					base: { ref: "main" },
					created_at: "2026-01-01T00:00:00Z",
					pull_requests: [{ number: 3, state: "open", merged_at: null, head: { ref: "feature" } }],
				},
			],
		]);
		const exec = new ScriptedCommandExecApi([exitedResult({ stdout })]);
		const result = await new RealGhStackRemoteInventoryGateway({
			cwd,
			env,
			exec,
		}).loadRemoteStacks();
		expect(result).toMatchObject({ ok: true, value: [{ id: "1", number: 2 }] });
		expect(exec.calls()).toEqual([
			{
				command: "gh",
				args: ["api", "repos/{owner}/{repo}/stacks", "--paginate", "--slurp"],
				options: { cwd, env, timeout: 15_000 },
			},
		]);
	});

	test("classifies API 404 separately from general discovery failure", async () => {
		const unavailable = new RealGhStackRemoteInventoryGateway({
			cwd,
			env,
			exec: new ScriptedCommandExecApi([exitedResult({ code: 1, stderr: "HTTP 404: Not Found" })]),
		});
		await expect(unavailable.loadRemoteStacks()).resolves.toMatchObject({
			ok: false,
			error: { type: "github-stacks-unavailable" },
		});

		const failed = new RealGhStackRemoteInventoryGateway({
			cwd,
			env,
			exec: new ScriptedCommandExecApi([
				exitedResult({ code: 1, stderr: "authentication failed" }),
			]),
		});
		await expect(failed.loadRemoteStacks()).resolves.toMatchObject({
			ok: false,
			error: { type: "github-stack-discovery-failed" },
		});
	});

	test("returns typed unsupported-response failures for invalid JSON and structure", async () => {
		for (const stdout of ["not-json", "{}"] as const) {
			const gateway = new RealGhStackRemoteInventoryGateway({
				cwd,
				env,
				exec: new ScriptedCommandExecApi([exitedResult({ stdout })]),
			});
			await expect(gateway.loadRemoteStacks()).resolves.toMatchObject({
				ok: false,
				error: { type: "github-stack-response-unsupported" },
			});
		}
	});
});
