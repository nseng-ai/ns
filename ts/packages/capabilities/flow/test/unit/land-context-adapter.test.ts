import { describe, expect, test } from "vitest";
import { formatCommand, type ExecResult } from "@sdl/core/command";
import { ScriptedQueue } from "@sdl/core/test-kit";
import { createLandContext } from "../../src/land/stack/land-context-adapter.ts";
import type { LandStackExtensionAPI } from "../../src/land/stack/types.ts";
import { metadataDbJson, TOPOLOGY_COMMAND, topologyArgs } from "./land-test-helpers.ts";

const ROOT = "/repo";
const DB_PATH = `${ROOT}/.git/.graphite_metadata.db`;
const TOPOLOGY_ARGS = topologyArgs(DB_PATH);
const FOR_EACH_REF_ARGS = [
	"for-each-ref",
	"--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)",
	"refs/heads",
];
const SQUASH_MERGE_ARGS = [
	"pr",
	"merge",
	"42",
	"--squash",
	"--match-head-commit",
	"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"--subject",
	"Merge subject",
	"--body",
	"Merge body",
];

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

class FakePi implements LandStackExtensionAPI {
	readonly execCalls: ExecCall[] = [];
	private readonly script: ScriptedQueue<ScriptedExec>;

	constructor(script: ScriptedExec[]) {
		this.script = new ScriptedQueue(script, (step) => step);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string; timeout?: number },
	): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const missingStepMessage = `unexpected exec: ${formatCommand(command, args)}`;
		const expected = this.script.shiftOrRecordError(missingStepMessage);
		if (expected === undefined) return execResult({ code: 99, stderr: missingStepMessage });
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${formatCommand(expected.command, expected.args)}, got ${formatCommand(command, args)}`;
			this.script.recordError(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	assertDone(): void {
		this.script.assertDone();
	}
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
		...(overrides.startupError === undefined ? {} : { startupError: overrides.startupError }),
	};
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

describe("land context adapter facts", () => {
	test("lists local branches with real tip SHAs", async () => {
		const pi = new FakePi([
			step("git", FOR_EACH_REF_ARGS, {
				stdout:
					"main\t1111111111111111111111111111111111111111\t2026-06-15T12:00:00+00:00\nfeature\t2222222222222222222222222222222222222222\t\n",
			}),
		]);
		const context = createLandContext(pi);

		await expect(context.git.listLocalBranches({ repoRoot: ROOT })).resolves.toEqual({
			type: "success",
			value: [
				{ name: "main", sha: "1111111111111111111111111111111111111111" },
				{ name: "feature", sha: "2222222222222222222222222222222222222222" },
			],
		});
		pi.assertDone();
	});

	test("squash merges pull requests with the existing gh argv", async () => {
		const pi = new FakePi([
			step("gh", SQUASH_MERGE_ARGS, { stdout: "merged\n", stderr: "notice\n" }),
		]);
		const context = createLandContext(pi);

		await expect(
			context.github.squashMergePullRequest({
				repoRoot: ROOT,
				pullRequest: {
					number: 42,
					title: "Merge subject",
					body: "Merge body",
					state: "OPEN",
					isDraft: false,
					headRefName: "feature",
					baseRefName: "main",
					headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				},
			}),
		).resolves.toEqual({ type: "success", value: { stdout: "merged\n", stderr: "notice\n" } });
		expect(pi.execCalls).toEqual([
			{ command: "gh", args: SQUASH_MERGE_ARGS, options: { cwd: ROOT, timeout: 120000 } },
		]);
		pi.assertDone();
	});

	test("loads stack shape from supplied facts without recursively loading a landing shape", async () => {
		const pi = new FakePi([
			step(TOPOLOGY_COMMAND, TOPOLOGY_ARGS, {
				stdout: `${metadataDbJson([
					{ branch: "main", children: ["feature"], trunk: true },
					{ branch: "feature", parent: "main", children: [] },
				])}\n`,
			}),
		]);
		const context = createLandContext(pi);

		const result = await context.graphite.stackShape({
			repoRoot: ROOT,
			metadataDbPath: DB_PATH,
			current: "feature",
			trunk: "main",
			liveLocalBranches: ["main", "feature"],
		});

		expect(result).toMatchObject({
			type: "success",
			value: {
				landingBranches: ["feature"],
				descendantBranches: [],
			},
		});
		expect(pi.execCalls.map((call) => call.command)).toEqual([TOPOLOGY_COMMAND]);
		pi.assertDone();
	});
});
