import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const REMOVED_CORE_DIR_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src",
	["co", "re"].join(""),
);
const WORKTREE_SUPPORT_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/ns/worktree.ts");
const PUSH_COMMAND_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/ns/commands/push.ts");
const SUBMIT_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/submit.ts",
);
const REGENERATE_PR_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/regenerate-pr.ts",
);
const AUTOBRANCH_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/autobranch.ts",
);
const BRANCH_LATEST_COMMIT_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/branch-latest-commit.ts",
);
const AUTOSLOT_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/autoslot.ts",
);
const LAND_COMMAND_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/src/ns/commands/land.ts");
const PULL_TRUNK_COMMAND_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/ns/commands/pull-trunk.ts",
);
const FLOW_PACKAGE_PATH = join(REPO_ROOT, "ts/packages/capabilities/flow/package.json");
const OLD_AUTOBRANCH_PACKAGE_MANIFEST_PATH = join(REPO_ROOT, "ts/packages/autobranch/package.json");
const FLOW_AUTOBRANCH_INTERNAL_PATH = join(
	REPO_ROOT,
	"ts/packages/capabilities/flow/src/autobranch/dirty-worktree.ts",
);

const REMOVED_LOCAL_AUTOBRANCH_HELPERS = [
	["ts/packages/capabilities/flow/src/autobranch", "branch-availability.ts"],
	["ts/packages/capabilities/flow/src/autobranch", "branch-slugs.ts"],
	["ts/packages/capabilities/flow/src/autobranch", "branch-slug-text.ts"],
	["ts/packages/capabilities/flow/src/autobranch", ["latest", "commit", "autobranch.ts"].join("-")],
] as const;

describe("project extension shared flow foundations", () => {
	test("flow autobranch commands use Flow-owned private autobranch helpers", async () => {
		const autobranchSource = await readFile(AUTOBRANCH_COMMAND_PATH, "utf8");
		const branchLatestCommitSource = await readFile(BRANCH_LATEST_COMMIT_COMMAND_PATH, "utf8");

		expect(autobranchSource).toContain("../../autobranch/dirty-worktree.ts");
		expect(branchLatestCommitSource).toContain("../../autobranch/latest-commit.ts");
		const removedAutobranchPackageSpecifier = ["@sdl", "autobranch"].join("/");
		expect(autobranchSource).not.toContain(`${removedAutobranchPackageSpecifier}/dirty-worktree`);
		expect(branchLatestCommitSource).not.toContain(
			`${removedAutobranchPackageSpecifier}/latest-commit`,
		);
		await expect(access(FLOW_AUTOBRANCH_INTERNAL_PATH, constants.F_OK)).resolves.toBeUndefined();
		await expect(access(OLD_AUTOBRANCH_PACKAGE_MANIFEST_PATH, constants.F_OK)).rejects.toThrow();
		for (const [directory, fileName] of REMOVED_LOCAL_AUTOBRANCH_HELPERS) {
			await expect(access(join(REPO_ROOT, directory, fileName), constants.F_OK)).rejects.toThrow();
		}
	});

	test("flow CLI commands own their orchestration instead of importing CCC", async () => {
		const autoslotSource = await readFile(AUTOSLOT_COMMAND_PATH, "utf8");
		const landSource = await readFile(LAND_COMMAND_PATH, "utf8");
		const pullTrunkSource = await readFile(PULL_TRUNK_COMMAND_PATH, "utf8");
		const autobranchSource = await readFile(AUTOBRANCH_COMMAND_PATH, "utf8");
		const branchLatestCommitSource = await readFile(BRANCH_LATEST_COMMIT_COMMAND_PATH, "utf8");
		const worktreeSource = await readFile(WORKTREE_SUPPORT_PATH, "utf8");
		const flowPackage = await readFile(FLOW_PACKAGE_PATH, "utf8");

		expect(worktreeSource).toContain("./exec.ts");
		expect(worktreeSource).toContain("createCliExecAdapter");
		expect(worktreeSource).toContain("execNsCommand");
		const removedCccPackageSpecifier = ["@sdl", "ccc"].join("/");
		for (const source of [autoslotSource, landSource, pullTrunkSource, flowPackage]) {
			expect(source).not.toContain(removedCccPackageSpecifier);
		}
		expect(flowPackage).toContain('"./api": "./src/api/index.ts"');
		expect(autoslotSource).toContain("../../autoslot/autoslot.ts");
		expect(landSource).toContain("../../land/land.ts");
		expect(pullTrunkSource).toContain("../../trunk-pull/trunk-pull.ts");
		expect(autobranchSource).not.toContain("_cwd");
		expect(branchLatestCommitSource).not.toContain("_cwd");
	});

	test("flow commands use package-owned migration seams instead of bundled submit and PR internals", async () => {
		const submitSource = await readFile(SUBMIT_COMMAND_PATH, "utf8");
		const regeneratePrSource = await readFile(REGENERATE_PR_COMMAND_PATH, "utf8");
		const worktreeSource = await readFile(WORKTREE_SUPPORT_PATH, "utf8");
		const pushSource = await readFile(PUSH_COMMAND_PATH, "utf8");

		expect(submitSource).not.toContain("private/tmp/legacy-submit-extension-build");
		expect(submitSource).not.toContain(["@sdl", ["co", "re"].join(""), "submit"].join("/"));
		expect(submitSource).not.toContain(["@sdl", "graphite", "submit"].join("/"));
		expect(submitSource).toContain("../../submit/ns-runtime.ts");
		expect(regeneratePrSource).not.toContain("MANAGED_BODY_BEGIN_MARKER");
		expect(regeneratePrSource).not.toContain("parseManagedRegionMetadata");
		expect(regeneratePrSource).not.toContain('ctx.exec("git"');
		expect(regeneratePrSource).toContain("../../submit/index.ts");
		await expect(access(REMOVED_CORE_DIR_PATH, constants.F_OK)).rejects.toThrow();
		expect(worktreeSource).toContain("@nseng-ai/capability-kit/pending-worktree");
		expect(worktreeSource).toContain("./exec.ts");
		expect(worktreeSource).toContain("execNsGit");
		expect(worktreeSource).not.toContain("./git.ts");
		expect(worktreeSource).not.toContain("execFlowGit");
		expect(worktreeSource).not.toContain('ctx.exec("git"');
		expect(worktreeSource).not.toContain("isClean");
		expect(pushSource).toContain("@nseng-ai/foundation/git");
		expect(pushSource).toContain("readNsGitPorcelainStatus");
		expect(pushSource).toContain("execNsGit");
		expect(pushSource).not.toContain("../shared/git.ts");
		expect(pushSource).not.toContain("execFlowGit");
		expect(pushSource).not.toContain('ctx.exec("git"');
	});
});
