import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { formatManagedGeneratedRegion, GENERATED_BODY_MARKER } from "@sdl/core/submit";
import { listSdlCommands } from "@sdl/sdl/cli";

import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type ExecCall,
	type RunWithFakesOptions,
	type ScriptedExecResponse,
} from "./sdl-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
const REGENERATE_PR_EXTENSION_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/regenerate-pr.ts", import.meta.url),
);
const SHARED_EXTENSION_HELPERS_SOURCE = fileURLToPath(
	new URL("../../../../../.sdl/extensions/shared", import.meta.url),
);
const tempProjectDirs: string[] = [];
const generatedText = `Improve PR descriptions

This regenerates the PR title and body with the sdl-owned prompt.

## Key Changes

- Adds title generation
- Adds guarded body updates`;

afterEach(() => {
	for (const directory of tempProjectDirs.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function runUnavailableRegeneratePrCli(args: readonly string[]) {
	return runCliWithFakes(
		{ args, state: { exec: [], textGeneration: [] } },
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

function createRegeneratePrProject(): string {
	const directory = mkdtempSyncCompat("sdl-regenerate-pr-project-");
	tempProjectDirs.push(directory);
	const extensionPath = join(directory, ".sdl", "extensions", "regenerate-pr.ts");
	mkdirSync(dirname(extensionPath), { recursive: true });
	copyFileSync(REGENERATE_PR_EXTENSION_SOURCE, extensionPath);
	cpSync(SHARED_EXTENSION_HELPERS_SOURCE, join(directory, ".sdl", "extensions", "shared"), {
		recursive: true,
	});
	return directory;
}

function mkdtempSyncCompat(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function runWithFakes(options: RunWithFakesOptions) {
	return runCliWithFakes(
		{ ...options, cwd: options.cwd ?? createRegeneratePrProject() },
		{
			execResponses: successfulRegeneratePrResponses,
			textGenerationResults: () => [{ ok: true, text: generatedText }],
			missingTextGenerationResult: () => ({ ok: true, text: generatedText }),
		},
	);
}

function successfulRegeneratePrResponses(): ScriptedExecResponse[] {
	return [
		{
			match: "gh pr view --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: `Old body\n${GENERATED_BODY_MARKER}` }) },
		},
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{
			match: "gh pr diff 123",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n+export const value = true;\n" },
		},
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: /^gh pr edit 123 --title Improve PR descriptions --body-file /, result: {} },
	];
}

function successfulReadOnlyRegeneratePrResponses(
	options: { body?: string } = {},
): ScriptedExecResponse[] {
	return successfulRegeneratePrResponses()
		.filter((response) => !(response.match instanceof RegExp))
		.map((response) => {
			if (response.match !== "gh pr view --json number,url,title,body,headRefName,baseRefName") {
				return response;
			}
			return {
				...response,
				result: { stdout: prJson({ body: options.body ?? `Old body\n${GENERATED_BODY_MARKER}` }) },
			};
		});
}

function prJson(options: { body: string; title?: string } = { body: "" }): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: options.title ?? "Existing PR title",
		body: options.body,
		headRefName: "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(): string {
	return JSON.stringify({
		commits: [{ messageHeadline: "Add regenerate-pr", messageBody: "Body from commit" }],
	});
}

function bodyInspectingEditResponse(assertBody: (body: string) => void): ScriptedExecResponse {
	return {
		match: (call: ExecCall) => {
			if (
				call.command !== "gh" ||
				call.args.slice(0, 5).join(" ") !== "pr edit 123 --title Improve PR descriptions"
			) {
				return false;
			}
			const bodyFileFlagIndex = call.args.indexOf("--body-file");
			const bodyPath = call.args[bodyFileFlagIndex + 1];
			if (bodyPath === undefined) return false;
			assertBody(readFileSync(bodyPath, "utf8"));
			return true;
		},
		result: {},
	};
}

describe("sdl regenerate-pr CLI availability", () => {
	test("regenerate-pr is not registered as a built-in command after the kernel reset", () => {
		expect(listSdlCommands().some((command) => command.name === "regenerate-pr")).toBe(false);
	});

	test("regenerate-pr help and invocation are unavailable without a project extension", async () => {
		const help = runUnavailableRegeneratePrCli(["regenerate-pr", "--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: sdl");
		expect(help.stdout.join("")).not.toContain("Usage: sdl regenerate-pr");

		for (const args of [["regenerate-pr"], ["regenerate-pr", "--force"]] as const) {
			const run = runUnavailableRegeneratePrCli(args);

			expect(await run.exit).not.toBe(0);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).toMatch(/too many arguments|unknown/i);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		}
	});

	test("project-local regenerate-pr appears in help, selected help, and JSON schema", async () => {
		const cwd = createRegeneratePrProject();

		const topHelp = runWithFakes({
			args: ["--help"],
			state: { exec: [], textGeneration: [] },
			cwd,
		});
		expect(await topHelp.exit).toBe(0);
		expect(topHelp.stdout.join("")).toContain("regenerate-pr");
		expect(topHelp.stdout.join("")).toContain(
			"Regenerate the PR title and SDL-managed body region.",
		);

		const commandHelp = runWithFakes({
			args: ["regenerate-pr", "--help"],
			state: { exec: [], textGeneration: [] },
			cwd,
		});
		expect(await commandHelp.exit).toBe(0);
		const help = commandHelp.stdout.join("");
		expect(help).toContain("Usage: sdl regenerate-pr");
		expect(help).toContain("Regenerate the current branch PR title");
		expect(help).toContain("--force");
		expect(help).toContain("SDL_DEV_PR_DESCRIPTION_MODEL");
		expect(help).toContain("SDL_DEV_PR_DESCRIPTION_PROMPT");

		const schema = runWithFakes({
			args: ["regenerate-pr", "--json-schema"],
			state: { exec: [], textGeneration: [] },
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("input_json_schema");
	});
});

describe("project-local regenerate-pr extension", () => {
	test("regenerates the current branch PR after confirmation", async () => {
		const run = runWithFakes({ args: ["regenerate-pr"], state: { confirm: () => true } });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Regenerated PR title and description.");
		expect(run.stdout.join("")).toContain(`PR: #123 ${PR_URL}`);
		expect(run.stdout.join("")).toContain("Prompt: built-in");
		expect(run.stderr.join("")).toBe("");
		expect(formattedExecCalls(run.context)).toEqual(
			expect.arrayContaining([
				"gh pr view --json number,url,title,body,headRefName,baseRefName",
				"git rev-parse --show-toplevel",
				"gh pr diff 123",
				"git patch-id --stable",
				"gh pr view 123 --json commits",
				expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
			]),
		);
		expect(run.context.textGeneratorCalls[0]).toMatchObject({
			operation: "pr-description",
			modelRef: "openai-codex/gpt-5.4-mini",
			maxTokens: 2048,
			reasoning: "low",
		});
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("## Context");
		expect(run.context.textGeneratorCalls[0]?.prompt).toContain("## Diff");
	});

	test("declined confirmation does not edit GitHub", async () => {
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: { confirm: () => false, exec: successfulReadOnlyRegeneratePrResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("cancelled");
		expect(formattedExecCalls(run.context)).not.toContainEqual(
			expect.stringContaining("gh pr edit"),
		);
	});

	test("missing confirmation channel does not edit GitHub", async () => {
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: { exec: successfulReadOnlyRegeneratePrResponses() },
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Confirmation is unavailable");
		expect(formattedExecCalls(run.context)).not.toContainEqual(
			expect.stringContaining("gh pr edit"),
		);
	});

	test("--force remains a compatibility no-op and still asks before editing", async () => {
		let asked = false;
		const run = runWithFakes({
			args: ["regenerate-pr", "--force"],
			state: {
				confirm: (_title, message) => {
					asked = true;
					expect(message).toContain("--force was provided");
					return true;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(asked).toBe(true);
		expect(formattedExecCalls(run.context)).toContainEqual(
			expect.stringMatching(/^gh pr edit 123 --title Improve PR descriptions --body-file /),
		);
	});

	test("preserves human body text outside the managed generated region", async () => {
		const oldRegion = formatManagedGeneratedRegion("Old generated body", {
			version: "2",
			patchId: "old-patch",
			promptHash: "sha256:old-prompt",
			generator: "sdl-pr-description-v2",
		});
		const existingBody = `Human intro\n\n${oldRegion}\n\nHuman footer`;
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: {
				confirm: () => true,
				exec: [
					...successfulReadOnlyRegeneratePrResponses({ body: existingBody }),
					bodyInspectingEditResponse((body) => {
						expect(body).toContain("Human intro");
						expect(body).toContain("Human footer");
						expect(body).toContain("This regenerates the PR title and body");
						expect(body).not.toContain("Old generated body");
					}),
				],
			},
		});

		expect(await run.exit).toBe(0);
	});

	test("reports no current PR clearly", async () => {
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: {
				confirm: () => true,
				exec: [
					{
						match: "gh pr view --json number,url,title,body,headRefName,baseRefName",
						result: { code: 1, stderr: "no pull requests found for branch\n" },
					},
				],
			},
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Could not resolve current branch PR");
		expect(run.context.execCalls).toHaveLength(1);
	});

	test("uses the historical PR description model environment override", async () => {
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: { confirm: () => true },
			env: { SDL_DEV_PR_DESCRIPTION_MODEL: "openai-codex/custom-mini" },
		});

		expect(await run.exit).toBe(0);
		expect(run.context.textGeneratorCalls[0]?.modelRef).toBe("openai-codex/custom-mini");
	});

	test("reports the historical env prompt path in success output", async () => {
		const promptPath = join(tmpdir(), `sdl-regenerate-pr-prompt-${Date.now()}.md`);
		await writeFile(promptPath, "custom system prompt", "utf8");
		try {
			const run = runWithFakes({
				args: ["regenerate-pr"],
				state: { confirm: () => true },
				env: { SDL_DEV_PR_DESCRIPTION_PROMPT: promptPath },
			});

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain(`Prompt: ${promptPath}`);
			expect(run.context.textGeneratorCalls[0]?.system).toBe("custom system prompt");
		} finally {
			await rm(promptPath, { force: true });
		}
	});

	test("unreadable prompt env path exits 2", async () => {
		const run = runWithFakes({
			args: ["regenerate-pr"],
			state: { confirm: () => true },
			env: { SDL_DEV_PR_DESCRIPTION_PROMPT: "/path/that/does/not/exist.md" },
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Could not read SDL_DEV_PR_DESCRIPTION_PROMPT");
	});
});
