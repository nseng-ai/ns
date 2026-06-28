import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const SHARED_GIT_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/shared/git.ts");
const SHARED_WORKTREE_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/shared/worktree.ts",
);
const PUSH_COMMAND_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/commands/push.ts");
const SUBMIT_COMMAND_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/commands/submit.ts");
const REGENERATE_PR_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/regenerate-pr.ts",
);
const AUTOBRANCH_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/autobranch.ts",
);
const BRANCH_LATEST_COMMIT_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/branch-latest-commit.ts",
);
const AUTOSLOT_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/autoslot.ts",
);
const LAND_COMMAND_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/commands/land.ts");
const PULL_TRUNK_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/commands/pull-trunk.ts",
);

const REMOVED_LOCAL_AUTOBRANCH_HELPERS = [
	["ts/packages/capabilities/flow/src/shared", "branch-availability.ts"],
	["ts/packages/capabilities/flow/src/shared", "branch-slugs.ts"],
	["ts/packages/capabilities/flow/src/shared", "branch-slug-text.ts"],
	["ts/packages/capabilities/flow/src/shared", ["latest", "commit", "autobranch.ts"].join("-")],
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

	test("flow CCC CLI commands delegate exec adaptation through the shared CCC CLI helper", async () => {
		const autoslotSource = await readFile(AUTOSLOT_COMMAND_PATH, "utf8");
		const landSource = await readFile(LAND_COMMAND_PATH, "utf8");
		const pullTrunkSource = await readFile(PULL_TRUNK_COMMAND_PATH, "utf8");
		const autobranchSource = await readFile(AUTOBRANCH_COMMAND_PATH, "utf8");
		const branchLatestCommitSource = await readFile(BRANCH_LATEST_COMMIT_COMMAND_PATH, "utf8");
		const worktreeSource = await readFile(SHARED_WORKTREE_PATH, "utf8");

		expect(worktreeSource).toContain("@sdl/capability-kit/git");
		expect(worktreeSource).toContain("createCliExecAdapter");
		expect(worktreeSource).toContain("execSdlCommand");
		for (const source of [autoslotSource, landSource]) {
			expect(source).toContain("runFlowCccCli");
			expect(source).toContain("../shared/ccc-cli.ts");
			expect(source).not.toContain("createCliExecAdapter");
			expect(source).not.toContain("options?.cwd");
		}
		expect(pullTrunkSource).toContain("runFlowCccOperation");
		expect(pullTrunkSource).toContain("../shared/ccc-cli.ts");
		expect(pullTrunkSource).not.toContain("createCliExecAdapter");
		expect(pullTrunkSource).not.toContain("options?.cwd");
		expect(autobranchSource).not.toContain("_cwd");
		expect(branchLatestCommitSource).not.toContain("_cwd");
	});

	test("flow commands use package-owned migration seams instead of bundled submit and PR internals", async () => {
		const submitSource = await readFile(SUBMIT_COMMAND_PATH, "utf8");
		const regeneratePrSource = await readFile(REGENERATE_PR_COMMAND_PATH, "utf8");
		const sharedGitSource = await readFile(SHARED_GIT_PATH, "utf8");
		const worktreeSource = await readFile(SHARED_WORKTREE_PATH, "utf8");
		const pushSource = await readFile(PUSH_COMMAND_PATH, "utf8");

		expect(submitSource).not.toContain("private/tmp/sdl-submit-extension-build");
		expect(submitSource).not.toContain("ts/packages/infra/core/src/submit");
		expect(submitSource).toContain("../shared/submit.ts");
		expect(regeneratePrSource).not.toContain("MANAGED_BODY_BEGIN_MARKER");
		expect(regeneratePrSource).not.toContain("parseManagedRegionMetadata");
		expect(regeneratePrSource).not.toContain('ctx.exec("git"');
		expect(regeneratePrSource).toContain("../shared/pr-description.ts");
		expect(sharedGitSource).toContain("execSdlGit as execFlowGit");
		expect(sharedGitSource).toContain("readSdlGitPorcelainStatus as readFlowGitPorcelainStatus");
		expect(sharedGitSource).not.toContain("git push");
		expect(worktreeSource).toContain("@sdl/domain-primitives-transitional/pending-worktree");
		expect(worktreeSource).toContain("./git.ts");
		expect(worktreeSource).toContain("execFlowGit");
		expect(worktreeSource).not.toContain('ctx.exec("git"');
		expect(worktreeSource).not.toContain("isClean");
		expect(pushSource).toContain("../shared/git.ts");
		expect(pushSource).toContain("readFlowGitPorcelainStatus");
		expect(pushSource).toContain("execFlowGit");
		expect(pushSource).not.toContain('ctx.exec("git"');
	});
});
