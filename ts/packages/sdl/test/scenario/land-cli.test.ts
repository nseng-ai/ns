import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import {
	runCliWithFakes,
	type ExecCall,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const FLOW_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/flow", import.meta.url),
);
const TRUNK = "main";
const CURRENT = "feature-branch";
const CHILD = "child-branch";
const SHA_CURRENT = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const tempProjectDirs: string[] = [];

afterEach(() => {
	for (const directory of tempProjectDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function createLandProject(): string {
	const directory = mkdtempSync(join(tmpdir(), "sdl-land-project-"));
	tempProjectDirs.push(directory);
	cpSync(FLOW_EXTENSION_SOURCE, join(directory, ".sdl", "extensions", "flow"), {
		recursive: true,
	});
	return directory;
}

function runWithFakes(options: RunWithFakesOptions) {
	const cwd = options.cwd ?? createLandProject();
	return runCliWithFakes(
		{ ...options, cwd },
		{
			execResponses: () => landStackShapeResponses(cwd),
			textGenerationResults: () => [],
		},
	);
}

function landStackShapeResponses(cwd: string | undefined): ScriptedExecResponse[] {
	const repoRoot = cwd ?? "/work";
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${repoRoot}\n` } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: `${CURRENT}\n` } },
		{ match: "gt trunk --no-interactive", result: { stdout: `${TRUNK}\n` } },
		{
			match: "git rev-parse --path-format=absolute --git-common-dir",
			result: { stdout: `${repoRoot}/.git\n` },
		},
		{
			match: (call) =>
				call.command === "sdl" &&
				call.args[0] === "flow" &&
				call.args[1] === "exec" &&
				call.args[2] === "read-graphite-branch-metadata",
			result: { stdout: `${metadataDbJson()}\n` },
		},
		{
			match: "git for-each-ref --format=%(refname:short)%09%(committerdate:iso-strict) refs/heads",
			result: { stdout: `${TRUNK}\n${CURRENT}\n${CHILD}\n` },
		},
	];
}

function progressAfterConfirmationResponses(cwd: string): ScriptedExecResponse[] {
	return [
		...landStackShapeResponses(cwd),
		{ match: "git status --porcelain=v1", result: {} },
		{ match: "git rev-parse -q --verify MERGE_HEAD", result: { code: 1 } },
		{ match: "git rev-parse -q --verify CHERRY_PICK_HEAD", result: { code: 1 } },
		{ match: "git rev-parse -q --verify REVERT_HEAD", result: { code: 1 } },
		{ match: "git rev-parse --git-path rebase-merge", result: { stdout: ".git/rebase-merge\n" } },
		{ match: "git rev-parse --git-path rebase-apply", result: { stdout: ".git/rebase-apply\n" } },
		{ match: `git show-ref --verify refs/heads/${CURRENT}`, result: {} },
		{
			match: `git rev-parse --verify refs/heads/${CURRENT}^{commit}`,
			result: { stdout: `${SHA_CURRENT}\n` },
		},
		{
			match: `gh pr view ${CURRENT} --json number,title,body,state,isDraft,headRefName,baseRefName,headRefOid,mergeStateStatus,url,mergedAt`,
			result: { stdout: `${stackPrView()}\n` },
		},
		{ match: "git worktree list --porcelain", result: { stdout: worktreeOutput(cwd) } },
		{ match: "git worktree list --porcelain", result: { stdout: worktreeOutput(cwd) } },
	];
}

function stackPrView(): string {
	return JSON.stringify({
		number: 42,
		title: "Ship feature",
		body: "Feature body",
		state: "OPEN",
		isDraft: false,
		headRefName: CURRENT,
		baseRefName: TRUNK,
		headRefOid: SHA_CURRENT,
		mergeStateStatus: "CLEAN",
		url: "https://github.example/pull/42",
		mergedAt: null,
	});
}

function worktreeOutput(cwd: string): string {
	return [
		`worktree ${cwd}`,
		"HEAD 0000000000000000000000000000000000000000",
		`branch refs/heads/${CURRENT}`,
	].join("\n");
}

function metadataDbJson(): string {
	return JSON.stringify([
		metadataRow({ branch: TRUNK, children: [CURRENT], trunk: true }),
		metadataRow({ branch: CURRENT, parent: TRUNK, children: [CHILD] }),
		metadataRow({ branch: CHILD, parent: CURRENT }),
	]);
}

function metadataRow(row: {
	branch: string;
	parent?: string | undefined;
	children?: string[] | undefined;
	trunk?: boolean | undefined;
}): Record<string, unknown> {
	return {
		branch_name: row.branch,
		parent_branch_name: row.parent ?? null,
		children: row.children === undefined ? null : JSON.stringify(row.children),
		validation_result: row.trunk === true ? "TRUNK" : "VALID",
	};
}

function formatExecCall(call: ExecCall): string {
	return [call.command, ...call.args].join(" ");
}

describe("sdl flow land", () => {
	test("emits live progress after the SDL confirmation hook approves landing", async () => {
		const cwd = createLandProject();
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			cwd,
			args: ["flow", "land"],
			state: {
				exec: progressAfterConfirmationResponses(cwd),
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return true;
				},
			},
		});

		await expect(run.exit).resolves.toBe(1);

		expect(confirmations).toHaveLength(1);
		expect(run.liveOutput).toContainEqual(
			expect.objectContaining({
				stream: "stderr",
				text: expect.stringContaining("→ Preparing to land 1 PR through feature-branch..."),
			}),
		);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("land stopped:");
	});

	test("flow exec metadata operation is invocable but hidden from flow help", async () => {
		const cwd = createLandProject();

		const flowHelp = runWithFakes({ cwd, args: ["flow", "--help"], state: { exec: [] } });
		await expect(flowHelp.exit).resolves.toBe(0);
		expect(flowHelp.stdout.join("")).not.toContain("exec");
		expect(flowHelp.stdout.join("")).not.toContain("read-graphite-branch-metadata");

		const execHelp = runWithFakes({ cwd, args: ["flow", "exec", "--help"], state: { exec: [] } });
		await expect(execHelp.exit).resolves.toBe(0);
		expect(execHelp.stdout.join("")).toContain("read-graphite-branch-metadata");
	});

	test("flow exec reads Graphite branch metadata through the controlled sqlite query", async () => {
		const cwd = createLandProject();
		const dbPath = `${cwd}/.git/.graphite_metadata.db`;
		const dbRows = metadataDbJson();
		const run = runWithFakes({
			cwd,
			args: ["flow", "exec", "read-graphite-branch-metadata", "--db-path", dbPath],
			state: {
				exec: [
					{
						match: (call) =>
							call.command === "sqlite3" &&
							formatExecCall(call) ===
								`sqlite3 -readonly -json ${dbPath} SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata`,
						result: { stdout: `${dbRows}\n` },
					},
				],
			},
		});

		await expect(run.exit).resolves.toBe(0);
		expect(run.stdout.join("")).toBe(`${dbRows}\n`);
		expect(run.stderr.join("")).toBe("");
	});

	test("uses the SDL confirmation hook instead of requiring --yes", async () => {
		const confirmations: Array<{ title: string; message: string }> = [];
		const run = runWithFakes({
			args: ["flow", "land"],
			state: {
				confirm: (title, message) => {
					confirmations.push({ title, message });
					return false;
				},
			},
		});

		await expect(run.exit).resolves.toBe(0);

		expect(confirmations).toEqual([
			{
				title: "Land stack?",
				message:
					"Land 1 PRs from feature-branch through feature-branch into main?\nDescendants above feature-branch will not be merged; this command will try to maintain them after landing.",
			},
		]);
		expect(run.stdout.join("")).toBe("Cancelled before merge; no PRs were landed.\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.execCalls.map(formatExecCall)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"gt trunk --no-interactive",
			"git rev-parse --path-format=absolute --git-common-dir",
			expect.stringContaining("sdl flow exec read-graphite-branch-metadata --db-path "),
			"git for-each-ref --format=%(refname:short)%09%(committerdate:iso-strict) refs/heads",
		]);
	});
});
