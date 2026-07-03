import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { runCommand } from "@sdl/core/exec";
import { graphiteBranchMetadataReadonlyJsonArgs } from "@sdl/capability-kit/graphite/metadata";
import { loadStackSnapshot } from "../../src/land/stack/stack-facts.ts";
import type { LandStackExtensionAPI } from "../../src/land/stack/types.ts";
import { createRequiredCommandRunner } from "./support/run-required-command.ts";

const REAL_GT_TEST_TIMEOUT_MS = 5 * 60_000;
const TEMP_ROOT_CLEANUP_RETRIES = 5;
const TEMP_ROOT_CLEANUP_RETRY_DELAY_MS = 100;

interface TempGraphiteRepo {
	repoRoot: string;
	env: NodeJS.ProcessEnv;
}

interface SqliteJsonOptions {
	cwd: string;
	env: NodeJS.ProcessEnv;
	dbPath: string;
	sql: string;
}

const runRequiredCommand = createRequiredCommandRunner({
	failureContext: "Command failed while preparing real gt fixture",
});

describe("land stack real Graphite CLI integration", () => {
	test(
		"reconciles dangling Graphite metadata to the live-ref view shown by gt ls",
		async () => {
			await withTempGraphiteRepo(async ({ repoRoot, env }) => {
				const dbPath = join(repoRoot, ".git", ".graphite_metadata.db");

				const rawRows = await sqliteJson({
					cwd: repoRoot,
					env,
					dbPath,
					sql: [
						"select branch_name, parent_branch_name, children, validation_result",
						"from branch_metadata order by branch_name",
					].join(" "),
				});
				expect(rawRows).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ branch_name: "feature-a", children: '["feature-b"]' }),
						expect.objectContaining({ branch_name: "feature-b" }),
					]),
				);

				const gtLs = await runRequiredCommand({
					cwd: repoRoot,
					env,
					command: "gt",
					args: ["ls", "--no-interactive"],
				});
				expect(gtLs.stdout).toContain("feature-a");
				expect(gtLs.stdout).toContain("master");
				expect(gtLs.stdout).not.toContain("feature-b");

				const snapshot = await loadStackSnapshot({
					pi: makeLandStackPi(env),
					repoRoot,
					metadataDbPath: dbPath,
					current: "feature-a",
					trunk: "master",
				});
				expect(snapshot.type).toBe("success");
				if (snapshot.type !== "success") throw new Error(snapshot.failure.message);
				expect(snapshot.value.landingBranches).toEqual(["feature-a"]);
				expect(snapshot.value.descendantBranches).toEqual([]);
				expect(snapshot.value.warnings.some((warning) => warning.includes("feature-b"))).toBe(true);
				expect(
					snapshot.value.warnings.some((warning) => warning.includes("gt untrack feature-b")),
				).toBe(true);
			});
		},
		REAL_GT_TEST_TIMEOUT_MS,
	);
});

async function withTempGraphiteRepo(run: (repo: TempGraphiteRepo) => Promise<void>): Promise<void> {
	const tempRoot = await mkdtemp(join(tmpdir(), "sdl-flow-real-gt-"));
	const repoRoot = join(tempRoot, "repo");
	const home = join(tempRoot, "home");
	const env = isolatedGraphiteEnv(home);

	try {
		await mkdir(repoRoot, { recursive: true });
		await mkdir(home, { recursive: true });
		await initializeGraphiteStack(repoRoot, env);
		await run({ repoRoot, env });
	} finally {
		await rm(tempRoot, {
			recursive: true,
			force: true,
			maxRetries: TEMP_ROOT_CLEANUP_RETRIES,
			retryDelay: TEMP_ROOT_CLEANUP_RETRY_DELAY_MS,
		});
	}
}

function isolatedGraphiteEnv(home: string): NodeJS.ProcessEnv {
	return {
		...process.env,
		HOME: home,
		XDG_CACHE_HOME: join(home, ".cache"),
		XDG_CONFIG_HOME: join(home, ".config"),
		XDG_STATE_HOME: join(home, ".state"),
	};
}

async function initializeGraphiteStack(repoRoot: string, env: NodeJS.ProcessEnv): Promise<void> {
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["init", "-b", "master"] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["config", "user.email", "test@example.com"],
	});
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["config", "user.name", "SDL Test"],
	});

	await writeFile(join(repoRoot, "README.md"), "initial\n");
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["add", "README.md"] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["commit", "-m", "initial"],
	});

	await writeFile(join(repoRoot, "trunk.txt"), "trunk\n");
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["add", "trunk.txt"] });
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["commit", "-m", "trunk"] });

	await writeFile(join(repoRoot, "feature-a.txt"), "feature a\n");
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["add", "feature-a.txt"] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "gt",
		args: ["create", "feature-a", "-m", "feature a", "--no-interactive", "--no-ai"],
	});

	await writeFile(join(repoRoot, "feature-b.txt"), "feature b\n");
	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["add", "feature-b.txt"] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "gt",
		args: ["create", "feature-b", "-m", "feature b", "--no-interactive", "--no-ai"],
	});

	await runRequiredCommand({ cwd: repoRoot, env, command: "git", args: ["checkout", "feature-a"] });
	await runRequiredCommand({
		cwd: repoRoot,
		env,
		command: "git",
		args: ["update-ref", "-d", "refs/heads/feature-b"],
	});
}

async function sqliteJson(options: SqliteJsonOptions): Promise<unknown> {
	const result = await runRequiredCommand({
		cwd: options.cwd,
		env: options.env,
		command: "sqlite3",
		args: ["-json", options.dbPath, options.sql],
	});
	const output = result.stdout.trim();
	return JSON.parse(output === "" ? "[]" : output) as unknown;
}

function makeLandStackPi(env: NodeJS.ProcessEnv): LandStackExtensionAPI {
	return {
		async exec(command, args, options = {}) {
			if (
				command === "ji" &&
				args[0] === "flow" &&
				args[1] === "exec" &&
				args[2] === "read-graphite-branch-metadata" &&
				args[3] === "--db-path" &&
				args[4] !== undefined
			) {
				return await runCommand("sqlite3", graphiteBranchMetadataReadonlyJsonArgs(args[4]), {
					...options,
					env,
				});
			}
			return await runCommand(command, args, {
				...options,
				env,
			});
		},
	};
}
