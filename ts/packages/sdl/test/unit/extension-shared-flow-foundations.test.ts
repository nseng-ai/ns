import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const SHARED_WORKTREE_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/shared/worktree.ts");
const SUBMIT_COMMAND_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/commands/submit.ts");
const REGENERATE_PR_COMMAND_PATH = join(
	REPO_ROOT,
	".sdl/extensions/flow/src/commands/regenerate-pr.ts",
);
const AUTOBRANCH_COMMAND_PATH = join(REPO_ROOT, ".sdl/extensions/flow/src/commands/autobranch.ts");
const BRANCH_LATEST_COMMIT_COMMAND_PATH = join(
	REPO_ROOT,
	".sdl/extensions/flow/src/commands/branch-latest-commit.ts",
);

const REMOVED_LOCAL_AUTOBRANCH_HELPERS = [
	[".sdl/extensions/flow/src/shared", "branch-availability.ts"],
	[".sdl/extensions/flow/src/shared", "branch-slugs.ts"],
	[".sdl/extensions/flow/src/shared", "branch-slug-text.ts"],
	[".sdl/extensions/flow/src/shared", ["latest", "commit", "autobranch.ts"].join("-")],
] as const;

describe("project extension shared flow foundations", () => {
	test("flow autobranch commands use the package-owned autobranch helpers", async () => {
		const autobranchSource = await readFile(AUTOBRANCH_COMMAND_PATH, "utf8");
		const branchLatestCommitSource = await readFile(BRANCH_LATEST_COMMIT_COMMAND_PATH, "utf8");

		expect(autobranchSource).toContain("@sdl/autobranch/dirty-worktree");
		expect(branchLatestCommitSource).toContain("@sdl/autobranch/latest-commit");
		expect(autobranchSource).not.toContain(["../shared", "branch-slugs"].join("/"));
		expect(branchLatestCommitSource).not.toContain(
			["../shared", ["latest", "commit", "autobranch"].join("-")].join("/"),
		);
		for (const [directory, fileName] of REMOVED_LOCAL_AUTOBRANCH_HELPERS) {
			await expect(access(join(REPO_ROOT, directory, fileName), constants.F_OK)).rejects.toThrow();
		}
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
