import { readFile } from "node:fs/promises";
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
const SHARED_WORKTREE_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/shared/worktree.ts");
const SUBMIT_COMMAND_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/commands/submit.ts");
const REGENERATE_PR_COMMAND_PATH = join(
	REPO_ROOT,
	".sdl/extensions/flow/src/commands/regenerate-pr.ts",
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

	test("flow commands use package-owned migration seams instead of bundled submit and PR internals", async () => {
		const submitSource = await readFile(SUBMIT_COMMAND_PATH, "utf8");
		const regeneratePrSource = await readFile(REGENERATE_PR_COMMAND_PATH, "utf8");
		const worktreeSource = await readFile(SHARED_WORKTREE_PATH, "utf8");

		expect(submitSource).not.toContain("private/tmp/sdl-submit-extension-build");
		expect(submitSource).not.toContain("ts/packages/sdl-core/src/submit");
		expect(submitSource).toContain("@sdl/sdl/submit");
		expect(regeneratePrSource).not.toContain("MANAGED_BODY_BEGIN_MARKER");
		expect(regeneratePrSource).not.toContain("parseManagedRegionMetadata");
		expect(regeneratePrSource).not.toContain('ctx.exec("git"');
		expect(regeneratePrSource).toContain("@sdl/sdl/pr-description");
		expect(worktreeSource).toContain("@sdl/sdl/pending-worktree");
		expect(worktreeSource).not.toContain("isClean");
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
