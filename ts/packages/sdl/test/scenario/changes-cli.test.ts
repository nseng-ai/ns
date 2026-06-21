import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { listSdlCommands } from "@sdl/sdl/cli";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const tempDirs: string[] = [];

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(options, {
		execResponses: dirtySnapshotResponses,
		textGenerationResults: () => [
			{ ok: true, text: "- Update app behavior\n- Add notes for reviewers" },
		],
	});
}

function dirtySnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
	];
}

function cleanSnapshotResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
	];
}

async function createChangesProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "sdl-changes-extension-project-"));
	tempDirs.push(directory);
	const extensionPath = join(directory, ".sdl", "extensions", "changes.ts");
	mkdirSync(dirname(extensionPath), { recursive: true });
	writeFileSync(
		extensionPath,
		readFileSync(join(process.cwd(), "..", ".sdl", "extensions", "changes.ts"), "utf8"),
	);
	return directory;
}

afterEach(() => {
	for (const directory of tempDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("sdl changes CLI", () => {
	test("static SDL command metadata is empty after the kernel reset", async () => {
		expect(listSdlCommands()).toEqual([]);

		const topHelp = runWithFakes({ args: ["--help"], state: { exec: [] } });
		expect(await topHelp.exit).toBe(0);
		const help = topHelp.stdout.join("");
		expect(help).toContain("Usage: sdl");
		expect(help).not.toContain("changes");
		expect(help).not.toContain("cp");
		expect(help).not.toContain("submit");
		expect(help).not.toContain("regenerate-pr");
		expect(topHelp.stderr.join("")).toBe("");
	});

	test("project-local direct changes extension appears in help and selected metadata", async () => {
		const cwd = await createChangesProject();

		const topHelp = runWithFakes({ args: ["--help"], state: { exec: [] }, cwd });
		expect(await topHelp.exit).toBe(0);
		const topLevelHelp = topHelp.stdout.join("");
		expect(topLevelHelp).toContain("changes");
		expect(topLevelHelp).toContain("Run SDL command entry 'changes'.");
		expect(topHelp.stderr.join("")).toBe("");

		const commandHelp = runWithFakes({ args: ["changes", "--help"], state: { exec: [] }, cwd });
		expect(await commandHelp.exit).toBe(0);
		const help = commandHelp.stdout.join("");
		expect(help).toContain("Usage: sdl changes");
		expect(help).toContain("read-only git commands");
		expect(help).toContain("SDL_CHANGES_MODEL");
		expect(help).toContain("PI_DRAFT_MODEL");
		expect(help).not.toContain("--format");

		const schema = runWithFakes({ args: ["changes", "--json-schema"], state: { exec: [] }, cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
	});

	test("clean worktree reports no outstanding changes without model generation", async () => {
		const cwd = await createChangesProject();
		const run = runWithFakes({ args: ["changes"], state: { exec: cleanSnapshotResponses() }, cwd });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("Working tree is clean; no outstanding changes.\n");
		expect(run.stderr.join("")).toBe("");
		expect(run.context.modelCalls).toEqual([]);
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
	});

	test("dirty worktree prints model bullets and raw status without mutation", async () => {
		const cwd = await createChangesProject();
		const run = runWithFakes({
			args: ["changes"],
			state: {
				textGeneration: [{ ok: true, text: "- Update app behavior\n- Add reviewer notes" }],
			},
			cwd,
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("Outstanding changes on feature/demo");
		expect(output).toContain("- Update app behavior");
		expect(output).toContain("- Add reviewer notes");
		expect(output).toContain("Files:\n M src/app.ts\n?? notes.md");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);
		expect(
			formattedExecCalls(run.context).some((call) => /git (add|commit|stash)|^gt |^gh /.test(call)),
		).toBe(false);
		expect(run.context.modelCalls).toEqual([
			expect.objectContaining({
				modelRef: "openai-codex/gpt-5.4-mini",
				operation: "changes-summary",
				maxTokens: 512,
				reasoning: "low",
			}),
		]);
		expect(run.context.modelCalls[0]?.prompt).toContain("## branch\n\nfeature/demo");
		expect(run.context.modelCalls[0]?.prompt).toContain("M src/app.ts\n?? notes.md");
		expect(run.context.modelCalls[0]?.prompt).toContain("diff --git a/src/app.ts b/src/app.ts");
	});

	test("changes model can be selected by SDL environment with legacy fallback", async () => {
		const cwd = await createChangesProject();
		const selected = runWithFakes({
			args: ["changes"],
			state: { textGeneration: [{ ok: true, text: "- Summarize selected model" }] },
			env: {
				SDL_CHANGES_MODEL: "openai-codex/custom-mini",
				PI_DRAFT_MODEL: "openai-codex/legacy-mini",
			},
			cwd,
		});
		expect(await selected.exit).toBe(0);
		expect(selected.context.modelCalls[0]?.modelRef).toBe("openai-codex/custom-mini");

		const fallback = runWithFakes({
			args: ["changes"],
			state: { textGeneration: [{ ok: true, text: "- Summarize fallback model" }] },
			env: { PI_DRAFT_MODEL: "openai-codex/legacy-mini" },
			cwd,
		});
		expect(await fallback.exit).toBe(0);
		expect(fallback.context.modelCalls[0]?.modelRef).toBe("openai-codex/legacy-mini");
	});

	test("model generation and validation failures exit 2 without mutation", async () => {
		const cwd = await createChangesProject();
		const invalid = runWithFakes({
			args: ["changes"],
			state: { textGeneration: [{ ok: true, text: "Summary\n- bullet" }] },
			cwd,
		});
		expect(await invalid.exit).toBe(2);
		expect(invalid.stdout.join("")).toBe("");
		expect(invalid.stderr.join("")).toContain("Model returned an invalid changes summary");
		expect(formattedExecCalls(invalid.context)).toEqual([
			"git rev-parse --show-toplevel",
			"git symbolic-ref --short HEAD",
			"git status --porcelain=v1",
			"git diff HEAD --no-ext-diff",
		]);

		const failed = runWithFakes({
			args: ["changes"],
			state: { textGeneration: [{ ok: false, error: "auth failed" }] },
			cwd,
		});
		expect(await failed.exit).toBe(2);
		expect(failed.stderr.join("")).toBe("auth failed\n");
		expect(
			formattedExecCalls(failed.context).some((call) =>
				/git (add|commit|stash)|^gt |^gh /.test(call),
			),
		).toBe(false);
	});

	test("git errors fail with command details", async () => {
		const cwd = await createChangesProject();
		const notGit = runWithFakes({
			args: ["changes"],
			state: {
				exec: [
					{
						match: "git rev-parse --show-toplevel",
						result: { code: 128, stderr: "fatal: not a git repository" },
					},
				],
			},
			cwd,
		});
		expect(await notGit.exit).toBe(2);
		const notGitError = notGit.stderr.join("");
		expect(notGitError).toContain("Not inside a git repository.");
		expect(notGitError).toContain("Command: git rev-parse --show-toplevel");
		expect(notGitError).toContain("Exit: 128");
		expect(notGitError).toContain("Killed: false");
		expect(notGitError).toContain("stderr:\nfatal: not a git repository");
		expect(notGit.context.modelCalls).toEqual([]);

		const statusFailed = runWithFakes({
			args: ["changes"],
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { code: 1, stderr: "index locked" } },
				],
			},
			cwd,
		});
		expect(await statusFailed.exit).toBe(2);
		const statusFailedError = statusFailed.stderr.join("");
		expect(statusFailedError).toContain("Could not inspect git status.");
		expect(statusFailedError).toContain("Command: git status --porcelain=v1");
		expect(statusFailedError).toContain("Exit: 1");
		expect(statusFailedError).toContain("stderr:\nindex locked");
		expect(statusFailed.context.modelCalls).toEqual([]);
	});

	test("raw status output is capped at 50 file lines", async () => {
		const cwd = await createChangesProject();
		const status = Array.from({ length: 52 }, (_value, index) => ` M file-${index}.ts`).join("\n");
		const run = runWithFakes({
			args: ["changes"],
			state: {
				exec: [
					{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
					{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
					{ match: "git status --porcelain=v1", result: { stdout: status } },
					{ match: "git diff HEAD --no-ext-diff", result: { stdout: "diff" } },
				],
				textGeneration: [{ ok: true, text: "- Update many files" }],
			},
			cwd,
		});

		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain(
			"Outstanding changes on feature/demo\n\n- Update many files\n\nFiles:",
		);
		expect(output).toContain(" M file-49.ts");
		expect(output).not.toContain(" M file-50.ts");
		expect(output).toContain("... 2 more file(s)");
	});
});
