import { FakeGraphiteStackGateway, fakeStackInfo } from "@nseng-ai/extension-kit/graphite/testing";
import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { describe, expect, test } from "vitest";

import { runFlowStackSquashWithContext } from "../../src/api/stack-squash.ts";

const TEST_CWD = "/work";

interface CommandResultState {
	command: string;
	args: readonly string[];
	result: ExecResult;
}

class InMemoryStackSquashCommands {
	readonly #results: ReadonlyMap<string, ExecResult>;
	readonly operations: Array<{ command: string; args: readonly string[] }> = [];

	constructor(state: readonly CommandResultState[]) {
		this.#results = new Map(
			state.map(({ command, args, result }) => [commandKey(command, args), result]),
		);
	}

	async exec(command: string, args: string[], _options?: ExecOptions): Promise<ExecResult> {
		this.operations.push({ command, args: [...args] });
		const result = this.#results.get(commandKey(command, args));
		if (result === undefined) throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		return result;
	}
}

function commandKey(command: string, args: readonly string[]): string {
	return `${command}\0${args.join("\0")}`;
}

function exited(options: { code?: number; stdout?: string; stderr?: string } = {}): ExecResult {
	return {
		type: "exited",
		code: options.code ?? 0,
		stdout: options.stdout ?? "",
		stderr: options.stderr ?? "",
		signal: null,
	};
}

function trackedStack(
	options: {
		current?: string;
		ancestors?: readonly string[];
	} = {},
): FakeGraphiteStackGateway {
	return new FakeGraphiteStackGateway({
		stack: {
			type: "stack",
			stack: fakeStackInfo({
				trunk: "main",
				current: options.current ?? "feature/top",
				ancestors: options.ancestors ?? ["main"],
			}),
		},
	});
}

function runWith(commands: InMemoryStackSquashCommands, graphite: FakeGraphiteStackGateway) {
	return runFlowStackSquashWithContext({ commands, graphite }, { cwd: TEST_CWD });
}

describe("Flow stack-squash API presentation", () => {
	test("presents a successful squash summary", async () => {
		const commands = new InMemoryStackSquashCommands([
			{ command: "git", args: ["status", "--porcelain=v1"], result: exited() },
			{
				command: "git",
				args: ["rev-list", "--count", "main..feature/top"],
				result: exited({ stdout: "3\n" }),
			},
			{
				command: "gt",
				args: ["checkout", "feature/top", "--no-interactive"],
				result: exited(),
			},
			{
				command: "gt",
				args: ["squash", "--no-edit", "--no-interactive"],
				result: exited(),
			},
		]);

		await expect(runWith(commands, trackedStack())).resolves.toEqual({
			type: "info",
			message:
				"Processed 1 Graphite stack branch; 3 commits became 1 (2 removed).\n\n- feature/top: 3 → 1 commit",
		});
	});

	test("presents dirty worktree status as an error", async () => {
		const commands = new InMemoryStackSquashCommands([
			{
				command: "git",
				args: ["status", "--porcelain=v1"],
				result: exited({ stdout: " M src/file.ts\n?? scratch.txt\n" }),
			},
		]);

		await expect(runWith(commands, trackedStack())).resolves.toEqual({
			type: "error",
			message:
				"Worktree has uncommitted changes; stack squash did not run.\n\nM src/file.ts\n?? scratch.txt",
		});
	});

	test("presents an empty stack as informational", async () => {
		const commands = new InMemoryStackSquashCommands([
			{ command: "git", args: ["status", "--porcelain=v1"], result: exited() },
		]);

		await expect(
			runWith(commands, trackedStack({ current: "main", ancestors: [] })),
		).resolves.toEqual({
			type: "info",
			message: "No Graphite stack branches to squash.",
		});
	});

	test("presents semantic stack discovery failures without command output", async () => {
		const commands = new InMemoryStackSquashCommands([
			{ command: "git", args: ["status", "--porcelain=v1"], result: exited() },
		]);
		const graphite = new FakeGraphiteStackGateway({
			stack: {
				type: "failure",
				failure: { message: "metadata unavailable", returnCode: null },
			},
		});

		await expect(runWith(commands, graphite)).resolves.toEqual({
			type: "error",
			message:
				"Could not read Graphite stack metadata: metadata unavailable. Stack squash did not run.",
		});
	});

	test("presents bounded stdout, stderr, and startup error for command failure", async () => {
		const commands = new InMemoryStackSquashCommands([
			{
				command: "git",
				args: ["status", "--porcelain=v1"],
				result: {
					type: "spawn-failed",
					stdout: "partial output\n",
					stderr: "diagnostic output\n",
					error: "git executable unavailable",
				},
			},
		]);

		const presentation = await runWith(commands, trackedStack());

		expect(presentation.type).toBe("error");
		expect(presentation.message).toContain(
			"Cannot inspect worktree state; stack squash did not run.",
		);
		expect(presentation.message).toContain("----- stdout tail -----\npartial output");
		expect(presentation.message).toContain("----- stderr tail -----\ndiagnostic output");
		expect(presentation.message).toContain("startup error:\ngit executable unavailable");
	});

	test("presents tip restoration failure with failed command output", async () => {
		const commands = new InMemoryStackSquashCommands([
			{ command: "git", args: ["status", "--porcelain=v1"], result: exited() },
			{
				command: "git",
				args: ["rev-list", "--count", "main..feature/top"],
				result: exited({ stdout: "1\n" }),
			},
			{
				command: "gt",
				args: ["checkout", "feature/top", "--no-interactive"],
				result: exited({ code: 1, stderr: "checkout blocked\n" }),
			},
		]);

		await expect(runWith(commands, trackedStack())).resolves.toEqual({
			type: "error",
			message:
				"Could not restore Graphite tip branch `feature/top`.\n\n----- stderr tail -----\ncheckout blocked",
		});
		expect(commands.operations.at(-1)).toEqual({
			command: "gt",
			args: ["checkout", "feature/top", "--no-interactive"],
		});
	});
});
