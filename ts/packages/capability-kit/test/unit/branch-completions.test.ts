import {
	extractSlashCommandArgumentPrefix,
	getBranchCompletions,
	listBranchCandidates,
} from "@nseng-ai/capability-kit/branch-completions";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

const COMMAND_NAME = "ns:host:workspace:open-branch";

class FakeCommands implements CommandExecApi {
	private readonly result: ExecResult;

	constructor(result: ExecResult) {
		this.result = result;
	}

	async exec(command: string, args: string[], _options?: ExecOptions): Promise<ExecResult> {
		expect({ command, args }).toEqual({
			command: "git",
			args: ["for-each-ref", "--format=%(refname:short)\t%(refname)", "refs/heads", "refs/remotes"],
		});
		return this.result;
	}
}

function exited(stdout: string, code = 0): ExecResult {
	return { type: "exited", stdout, stderr: "", code, signal: null };
}

describe("extractSlashCommandArgumentPrefix", () => {
	test("returns the prefix after the command name", () => {
		expect(extractSlashCommandArgumentPrefix(COMMAND_NAME, `/${COMMAND_NAME} feat`)).toBe("feat");
	});

	test("returns undefined for unrelated input", () => {
		expect(
			extractSlashCommandArgumentPrefix(COMMAND_NAME, "/ns:host:workspace:dispatch-plan"),
		).toBeUndefined();
	});

	test("returns an empty string for a trailing space", () => {
		expect(extractSlashCommandArgumentPrefix(COMMAND_NAME, `/${COMMAND_NAME} `)).toBe("");
	});

	test("returns undefined once an argument is complete", () => {
		expect(
			extractSlashCommandArgumentPrefix(COMMAND_NAME, `/${COMMAND_NAME} one two`),
		).toBeUndefined();
	});
});

describe("getBranchCompletions", () => {
	test("returns local branches matching a prefix", async () => {
		const commands = new FakeCommands(
			exited(
				[
					"feat-abc\trefs/heads/feat-abc",
					"feat-xyz\trefs/heads/feat-xyz",
					"main\trefs/heads/main",
				].join("\n"),
			),
		);

		const completions = await getBranchCompletions(commands, "/repo", "feat");

		expect(completions.map((completion) => completion.value)).toEqual(["feat-abc", "feat-xyz"]);
	});

	test("prefers exact matches and sorts local branches before remote ones", async () => {
		const commands = new FakeCommands(
			exited(
				[
					"origin/feat\trefs/remotes/origin/feat",
					"feat\trefs/heads/feat",
					"feat-two\trefs/heads/feat-two",
				].join("\n"),
			),
		);

		const completions = await getBranchCompletions(commands, "/repo", "feat");

		expect(completions.map((completion) => completion.value)).toEqual(["feat"]);
	});

	test("falls back to substring matches with remote candidates marked", async () => {
		const commands = new FakeCommands(
			exited(
				["origin/topic-fix\trefs/remotes/origin/topic-fix", "main\trefs/heads/main"].join("\n"),
			),
		);

		const completions = await getBranchCompletions(commands, "/repo", "fix");

		expect(completions).toEqual([
			{ value: "origin/topic-fix", label: "origin/topic-fix", description: "remote" },
		]);
	});

	test("returns nothing when git fails", async () => {
		const commands = new FakeCommands(exited("", 1));

		await expect(getBranchCompletions(commands, "/repo", "feat")).resolves.toEqual([]);
	});
});

describe("listBranchCandidates", () => {
	test("deduplicates names and skips HEAD refs", async () => {
		const commands = new FakeCommands(
			exited(
				[
					"main\trefs/heads/main",
					"main\trefs/remotes/origin/main",
					"origin/HEAD\trefs/remotes/origin/HEAD",
				].join("\n"),
			),
		);

		await expect(listBranchCandidates(commands, "/repo")).resolves.toEqual([
			{ name: "main", scope: "local" },
		]);
	});
});
