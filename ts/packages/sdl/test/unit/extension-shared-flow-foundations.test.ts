import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";
import type { ExecResult } from "../../src/sdk/index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_SCRATCH_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/shared/scratch.ts");
const SHARED_COMMAND_OUTPUT_PATH = join(
	REPO_ROOT,
	".sdl/extensions/flow/src/shared/command-output.ts",
);

interface SharedScratchModule {
	withFlowTemporaryFile<T>(
		options: { prefix: string; filename: string; contents: string },
		callback: (path: string) => Promise<T>,
	): Promise<T>;
}

interface SharedCommandOutputModule {
	commandFailure(options: {
		command: string;
		args: readonly string[];
		result: ExecResult;
		code: string;
		message: string;
	}): { code: string; message: string } | undefined;
	formatCommandDetails(result: ExecResult): string;
}

describe("project extension shared flow foundations", () => {
	test("routes temporary file lifecycle through the flow scratch helper", async () => {
		const scratchModule = await createSdlJiti().import(SHARED_SCRATCH_PATH);
		assertSharedScratchModule(scratchModule);

		let callbackPath = "";
		const callbackResult = await scratchModule.withFlowTemporaryFile(
			{ prefix: "sdl-flow-scratch-test-", filename: "message.txt", contents: "hello scratch\n" },
			async (path) => {
				callbackPath = path;
				expect(await readFile(path, "utf8")).toBe("hello scratch\n");
				return "callback-complete";
			},
		);

		expect(callbackResult).toBe("callback-complete");
		await expect(stat(dirname(callbackPath))).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("preserves command failure and details formatting", async () => {
		const commandOutputModule = await createSdlJiti().import(SHARED_COMMAND_OUTPUT_PATH);
		assertSharedCommandOutputModule(commandOutputModule);

		const result: ExecResult = { stdout: "", stderr: "fatal: nope", code: 1, killed: false };

		expect(commandOutputModule.formatCommandDetails(result)).toBe("exit 1: fatal: nope");
		expect(
			commandOutputModule.commandFailure({
				command: "gh",
				args: ["pr", "edit", "12", "--title", "hello world"],
				result,
				code: "github_pr_edit_failed",
				message: "Could not update PR #12.",
			}),
		).toEqual({
			code: "github_pr_edit_failed",
			message:
				'Could not update PR #12.\ngh pr edit 12 --title "hello world" exited 1: fatal: nope',
		});
	});
});

function assertSharedScratchModule(value: unknown): asserts value is SharedScratchModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared scratch module object.");
	}
	if (!("withFlowTemporaryFile" in value) || typeof value.withFlowTemporaryFile !== "function") {
		throw new Error("Expected shared scratch module to export withFlowTemporaryFile.");
	}
}

function assertSharedCommandOutputModule(
	value: unknown,
): asserts value is SharedCommandOutputModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared command output module object.");
	}
	if (!("commandFailure" in value) || typeof value.commandFailure !== "function") {
		throw new Error("Expected shared command output module to export commandFailure.");
	}
	if (!("formatCommandDetails" in value) || typeof value.formatCommandDetails !== "function") {
		throw new Error("Expected shared command output module to export formatCommandDetails.");
	}
}
