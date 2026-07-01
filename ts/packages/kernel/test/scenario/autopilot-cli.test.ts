import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInObjectiveExtension } from "../helpers/objective-extension.ts";
import {
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/sdl-cli-fakes.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in Objective autopilot CLI seam", () => {
	test("autopilot verbs are reachable under exec but hidden from top-level help", async () => {
		const cwd = await createObjectiveProject();

		const help = runWithExtension({ args: ["objective", "--help"], cwd }, []);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).not.toContain("autopilot-preflight");
		expect(help.stdout.join("")).not.toContain("autopilot-land-slice");

		const preflightHelp = runWithExtension(
			{ args: ["objective", "exec", "autopilot-preflight", "--help"], cwd },
			[],
		);
		expect(await preflightHelp.exit).toBe(0);
		expect(preflightHelp.stdout.join("")).toContain(
			"Usage: sdl objective exec autopilot-preflight",
		);

		const landSliceHelp = runWithExtension(
			{ args: ["objective", "exec", "autopilot-land-slice", "--help"], cwd },
			[],
		);
		expect(await landSliceHelp.exit).toBe(0);
		expect(landSliceHelp.stdout.join("")).toContain(
			"Usage: sdl objective exec autopilot-land-slice",
		);
	});

	test("preflight reports ok:true for a clean worktree on a non-trunk branch", async () => {
		const cwd = await createObjectiveProject();

		const run = runWithExtension(
			{
				args: ["objective", "exec", "autopilot-preflight", "demo-objective", "--format", "json"],
				cwd,
			},
			[
				{ match: "git status --porcelain -- .", result: { stdout: "" } },
				{ match: "git branch --show-current", result: { stdout: "feature/demo-objective\n" } },
			],
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: { ok: true, startBranch: "feature/demo-objective", trunk: "main", violations: [] },
		});
	});

	test("preflight reports violations for a dirty worktree on trunk", async () => {
		const cwd = await createObjectiveProject();

		const run = runWithExtension(
			{
				args: ["objective", "exec", "autopilot-preflight", "demo-objective", "--format", "json"],
				cwd,
			},
			[
				{
					match: "git status --porcelain -- .",
					result: { stdout: " M ts/packages/objective/src/index.ts\n" },
				},
				{ match: "git branch --show-current", result: { stdout: "main\n" } },
			],
		);
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: { ok: false, violations: ["worktree-dirty", "on-trunk"] },
		});
	});

	test("land-slice verifies live git state, stages, and commits via gt modify", async () => {
		const cwd = await createObjectiveProject();

		const run = runWithExtension(
			{
				args: [
					"objective",
					"exec",
					"autopilot-land-slice",
					"demo-objective",
					"--start-branch",
					"feature/demo-objective",
					"--message",
					"Land slice",
					"--format",
					"json",
				],
				cwd,
			},
			[
				{
					match: "git status --porcelain=v1",
					result: { stdout: "A  .sdl/objectives/demo-objective/updates/2026-06-30-slice.md\n" },
				},
				{
					match: "git branch --show-current",
					result: { stdout: "feature/demo-objective-slice\n" },
				},
				{
					match: "gt info feature/demo-objective-slice --no-interactive",
					result: { stdout: "tracked\n" },
				},
				{ match: "git diff --check", result: {} },
				{
					match: "git add -- .sdl/objectives/demo-objective/updates/2026-06-30-slice.md",
					result: {},
				},
				{
					match: "gt modify --no-interactive -m Land slice",
					result: { stdout: "Modified feature/demo-objective-slice\n" },
				},
			],
		);
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "ok",
			data: {
				ok: true,
				committed: true,
				submitted: false,
				branch: "feature/demo-objective-slice",
				changedFiles: [".sdl/objectives/demo-objective/updates/2026-06-30-slice.md"],
				violations: [],
			},
		});
	});

	test("land-slice refuses to commit when verification fails and reports violations", async () => {
		const cwd = await createObjectiveProject();

		const run = runWithExtension(
			{
				args: [
					"objective",
					"exec",
					"autopilot-land-slice",
					"demo-objective",
					"--start-branch",
					"feature/demo-objective",
					"--message",
					"Land slice",
					"--format",
					"json",
				],
				cwd,
			},
			[
				{ match: "git status --porcelain=v1", result: { stdout: "" } },
				{ match: "git branch --show-current", result: { stdout: "feature/demo-objective\n" } },
			],
		);
		expect(await run.exit).toBe(1);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "negative",
			data: { ok: false, committed: false, violations: ["clean-worktree", "branch-not-moved"] },
		});
	});
});

async function createObjectiveProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-objective-autopilot-project-"));
	tempDirs.push(directory);
	installCheckedInObjectiveExtension(directory);
	await writeObjectiveRecord(directory, "demo-objective");
	return directory;
}

async function writeObjectiveRecord(projectRoot: string, slug: string): Promise<void> {
	const recordRoot = join(projectRoot, ".sdl", "objectives", slug);
	await mkdir(join(recordRoot, "updates"), { recursive: true });
	await writeFile(join(recordRoot, "objective.md"), `# ${slug}\n`, "utf8");
	await writeFile(join(recordRoot, "roadmap.md"), "# Roadmap\n", "utf8");
}

/** Responses `createSdlObjectiveContext` always needs to resolve repoRoot and trunk branch. */
function contextSetupResponses(cwd: string): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git symbolic-ref --short refs/remotes/origin/HEAD", result: { code: 1 } },
		{ match: "git rev-parse --verify refs/heads/main", result: { stdout: "abc123\n" } },
	];
}

function runWithExtension(
	options: { args: readonly string[]; cwd: string },
	responses: readonly ScriptedExecResponse[],
) {
	const cwd = options.cwd;
	return runCliWithFakes(options, {
		execResponses: () => [...contextSetupResponses(cwd), ...responses],
		textGenerationResults: () => [],
	});
}
