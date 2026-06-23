import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { createSdlJiti } from "../../src/sdk/module-loader.ts";
import type { ExecResult } from "../../src/sdk/index.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_COMMAND_OUTPUT_PATH = join(
	REPO_ROOT,
	".sdl/extensions/flow/src/shared/command-output.ts",
);

interface SharedCommandOutputModule {
	commandFailure(options: {
		command: string;
		args: readonly string[];
		result: ExecResult;
		code: string;
		message: string;
	}): { code: string; message: string } | undefined;
}

describe("project extension shared flow foundations", () => {
	test("preserves command failure and details formatting", async () => {
		const commandOutputModule = await createSdlJiti().import(SHARED_COMMAND_OUTPUT_PATH);
		assertSharedCommandOutputModule(commandOutputModule);

		const result: ExecResult = { stdout: "", stderr: "fatal: nope", code: 1, killed: false };

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
				"Could not update PR #12.\nCommand: gh pr edit 12 --title 'hello world'\nexit 1: fatal: nope",
		});
	});
});

function assertSharedCommandOutputModule(
	value: unknown,
): asserts value is SharedCommandOutputModule {
	if (typeof value !== "object" || value === null) {
		throw new Error("Expected shared command output module object.");
	}
	if (!("commandFailure" in value) || typeof value.commandFailure !== "function") {
		throw new Error("Expected shared command output module to export commandFailure.");
	}
}
