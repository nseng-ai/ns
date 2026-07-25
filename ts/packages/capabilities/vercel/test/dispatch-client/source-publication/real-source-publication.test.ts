import { describe, expect, test } from "vitest";

import { ScriptedCommandExecApi, exitedResult } from "@nseng-ai/foundation/exec/testing";

import { createSourcePublicationRepositoryGateway } from "../../../src/dispatch-client/source-publication/real-source-publication.ts";

const TOP_HEAD = "a".repeat(40);
const BASE_HEAD = "b".repeat(40);
const TOP_REMOTE = "c".repeat(40);
const BASE_REMOTE = "d".repeat(40);
const BRANCHES = ["feature/top", "feature/base"] as const;

const git = {
	async currentBranch() {
		return { type: "branch" as const, branch: "feature/top" };
	},
	async headCommit() {
		return { ok: true as const, value: TOP_HEAD };
	},
	async statusPaths() {
		return { ok: true as const, value: { changedPaths: [] } };
	},
};

function localRows(upstreams: readonly [string, string]): string {
	return [
		`feature/top\0${TOP_HEAD}\0${upstreams[0]}`,
		`feature/base\0${BASE_HEAD}\0${upstreams[1]}`,
	].join("\n");
}

function gateway(commands: ScriptedCommandExecApi) {
	return createSourcePublicationRepositoryGateway({ cwd: "/repo", commands }, git);
}

describe("real source-publication repository observation", () => {
	test("observes branches without upstreams using one local plumbing read", async () => {
		const commands = new ScriptedCommandExecApi([exitedResult({ stdout: localRows(["", ""]) })]);

		expect(await gateway(commands).observeAffectedBranches(BRANCHES)).toMatchObject({
			ok: true,
			value: { remoteTips: { "feature/top": null, "feature/base": null } },
		});
		expect(commands.calls()).toHaveLength(1);
	});

	test("observes multiple upstreams in one deterministic show-ref read", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({
				stdout: localRows(["refs/remotes/origin/top", "refs/remotes/origin/base"]),
			}),
			exitedResult({
				stdout: `${BASE_REMOTE} refs/remotes/origin/base\n${TOP_REMOTE} refs/remotes/origin/top\n`,
			}),
		]);

		expect(await gateway(commands).observeAffectedBranches(BRANCHES)).toMatchObject({
			ok: true,
			value: {
				remoteTips: { "feature/top": TOP_REMOTE, "feature/base": BASE_REMOTE },
			},
		});
		expect(commands.calls()[1]).toMatchObject({
			command: "git",
			args: ["show-ref", "--verify", "refs/remotes/origin/base", "refs/remotes/origin/top"],
		});
	});

	test("fails closed when successful upstream output is incomplete", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({
				stdout: localRows(["refs/remotes/origin/top", "refs/remotes/origin/base"]),
			}),
			exitedResult({ stdout: `${TOP_REMOTE} refs/remotes/origin/top\n` }),
		]);

		expect(await gateway(commands).observeAffectedBranches(BRANCHES)).toMatchObject({
			ok: false,
			error: { code: "dispatch-source-publication-remote-observation-incomplete" },
		});
	});

	test.each([
		["malformed", `${TOP_REMOTE}\n`],
		[
			"duplicate",
			`${TOP_REMOTE} refs/remotes/origin/top\n${BASE_REMOTE} refs/remotes/origin/top\n`,
		],
		["unknown", `${TOP_REMOTE} refs/remotes/origin/other\n`],
	])("fails closed on %s upstream rows", async (_name, stdout) => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({ stdout: localRows(["refs/remotes/origin/top", ""]) }),
			exitedResult({ stdout }),
		]);

		expect(await gateway(commands).observeAffectedBranches(BRANCHES)).toMatchObject({
			ok: false,
			error: { code: "dispatch-source-publication-remote-observation-parse-failed" },
		});
	});

	test("preserves command diagnostics when the batched upstream read fails", async () => {
		const commands = new ScriptedCommandExecApi([
			exitedResult({ stdout: localRows(["refs/remotes/origin/top", ""]) }),
			exitedResult({ code: 1, stderr: "missing ref" }),
		]);

		expect(await gateway(commands).observeAffectedBranches(BRANCHES)).toMatchObject({
			ok: false,
			error: {
				code: "dispatch-source-publication-remote-observation-failed",
				displayCommand: "git show-ref --verify refs/remotes/origin/top",
			},
		});
	});
});
