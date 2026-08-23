import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { installCheckedInFlowExtension } from "../helpers/flow-extension.ts";
import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/ns-cli-fakes.ts";

const PR_URL = "https://github.com/acme/repo/pull/123";
const tempDirs: string[] = [];

afterEach(async () => {
	for (const directory of tempDirs.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("checked-in flow ns extension loading", () => {
	test("real loader exposes cp help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "cp", "--help"], cwd });
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: ns flow cp");
		expect(help.stdout.join("")).toContain("--dry-run");
		expect(help.stdout.join("")).not.toContain("NS_CHECKPOINT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "cp", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader renders cp strings verbatim for humans and Markdown while preserving JSON", async () => {
		const cwd = await createFlowProject();
		const styledHeadline = `abc123 \x1b[1m[cp] Update checkpoint\x1b[0m`;
		const plainResult = `abc123 [cp] Update checkpoint\n[cp] Update integration checkpoint\n\n- Cover loader invocation`;
		const styledResult = `${styledHeadline}\n[cp] Update integration checkpoint\n\n- Cover loader invocation`;
		const runCp = (format?: "markdown" | "json", canEmitAnsi = false) =>
			runWithRealFlowExtension({
				args: ["flow", "cp", ...(format === undefined ? [] : ["--format", format])],
				cwd,
				renderCapabilities: { canEmitAnsi },
				state: {
					exec: dirtyCpExecResponses(cwd, styledHeadline),
					textGeneration: [
						{
							ok: true,
							text: `[cp] Update integration checkpoint\n\n- Cover loader invocation`,
						},
					],
				},
			});

		const human = runCp();
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toBe(`${plainResult}\n`);
		expect(human.stdout.join("")).not.toContain("\\n");
		expect(human.stdout.join("")).not.toContain("\\u001b");
		expect(formattedExecCalls(human.context)).toContain("gt trunk --no-interactive");
		expect(formattedExecCalls(human.context)).toContain("git add -A");
		expect(human.context.textGeneratorCalls).toHaveLength(1);

		const ansiHuman = runCp(undefined, true);
		expect(await ansiHuman.exit).toBe(0);
		expect(ansiHuman.stdout.join("")).toBe(`${styledResult}\n`);

		const markdown = runCp("markdown");
		expect(await markdown.exit).toBe(0);
		expect(markdown.stdout.join("")).toBe(`${plainResult}\n`);

		const json = runCp("json");
		expect(await json.exit).toBe(0);
		expect(parseJsonOutput(json)).toMatchObject({ status: "ok", data: styledResult });
	});

	test("real loader exposes changes help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "changes", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow changes");
		expect(output).toContain("read-only git commands");
		expect(output).not.toContain("NS_CHANGES_MODEL");
		expect(output).not.toContain("PI_DRAFT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "changes", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader exposes push help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "push", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow push");
		expect(output).toContain("plain git push");
		expect(output).toContain("clean worktree");
		expect(output).toContain("Graphite-tracked PR branches");
		expect(output).toContain("ns flow submit");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "push", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader exposes branch-latest-commit help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({
			args: ["flow", "branch-latest-commit", "--help"],
			cwd,
		});
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("").replace(/\s+/g, " ");
		expect(output).toContain("Usage: ns flow branch-latest-commit");
		expect(output).toContain("--slug");
		expect(output).toContain("clean worktree");
		expect(output).toContain("latest eligible single-parent commit");
		expect(output).toContain("has no upstream");
		expect(output).toContain("locally ahead of its locally known upstream");
		expect(output).toContain("exactly synchronized on a non-trunk branch");
		expect(output).toContain(
			"Remote-ahead, diverged, and exactly synchronized configured Graphite trunk states are refused",
		);
		expect(output).toContain("only local tracking refs and do not fetch");
		expect(output).toContain("local-only Graphite branch");
		expect(output).toContain("does not fetch, push, publish, submit, or update PRs");
		expect(output).toContain("explicitly run `ns flow submit` from the new child");
		expect(output).toContain("ns flow autobranch");
		expect(output).not.toContain("stashes pending changes");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "branch-latest-commit", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(schema.stdout.join("")).toContain("latest commit");
		expect(schema.stdout.join("")).toContain("slug");
	});

	test("real loader exposes autobranch help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "autobranch", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("").replace(/\s+/g, " ");
		expect(output).toContain("Usage: ns flow autobranch");
		expect(output).toContain("--slug");
		expect(output).toContain("gt create");
		expect(output).toContain("dirty worktree changes");
		expect(output).toContain("ns flow branch-latest-commit");
		expect(output).toContain("latest eligible commit");
		expect(output).not.toContain("eligible unpushed");
		expect(output).not.toContain("NS_SLUG_MODEL");
		expect(output).not.toContain("NS_CHECKPOINT_MODEL");
		expect(output).not.toContain("NS_DEV_CHECKPOINT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "autobranch", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(schema.stdout.join("")).toContain("slug");
	});

	test("real loader rejects unexpected push arguments before git or model calls", async () => {
		const cwd = await createFlowProject();
		const run = runWithRealFlowExtension({ args: ["flow", "push", "unexpected"], cwd });

		expect(await run.exit).not.toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).not.toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("real loader exposes regenerate-pr help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "regenerate-pr", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow regenerate-pr");
		expect(output).toContain(
			"Regenerate and completely replace the current branch PR title and body",
		);
		expect(output).toContain("--yes");
		expect(output).toContain("-y");
		expect(output).not.toContain("--force");
		expect(output).not.toContain("NS_DEV_PR_DESCRIPTION_MODEL");
		expect(output).toContain("NS_DEV_PR_DESCRIPTION_PROMPT");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "regenerate-pr", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader exposes submit help metadata", async () => {
		const cwd = await createFlowProject();
		const help = runWithRealFlowExtension({ args: ["flow", "submit", "--help"], cwd });

		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow submit");
		expect(output).toContain("--no-restack");
		expect(output).toContain("--force");
		expect(output).toContain("--verbose");
		expect(output).not.toContain("--minimal");
		expect(output).not.toMatch(/(?:^|\s)-m(?:,|\s|$)/mu);
		expect(output).not.toContain("NS_DEV_PR_DESCRIPTION_MODEL");
		expect(output).toContain("NS_SUBMIT_FAILURE_LOG_DIR");
		expect(help.stderr.join("")).toBe("");
	});

	test.each(["--minimal", "-m"])(
		"real loader rejects removed submit option %s before command or model calls",
		async (option) => {
			const cwd = await createFlowProject();
			const run = runWithRealFlowExtension({ args: ["flow", "submit", option], cwd });

			expect(await run.exit).toBe(2);
			expect(run.stdout.join("")).toBe("");
			expect(run.stderr.join("")).not.toBe("");
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		},
	);

	test("real loader reaches a simple submit invocation path", async () => {
		const cwd = await createFlowProjectWithGraphiteStack();
		const run = runWithRealFlowExtension({
			args: ["flow", "submit"],
			cwd,
			state: {
				exec: successfulSubmitResponses(cwd),
				textGeneration: [{ ok: true, text: "Generated PR\n\nGenerated body" }],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Submitted 1 PR:");
		expect(run.stdout.join("")).toContain(`✓ #123 ${PR_URL}`);
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web\n",
		});
		expect(
			run.liveOutput.some(
				(entry) =>
					entry.stream === "stderr" &&
					entry.text.includes("ns flow submit") &&
					entry.text.includes("Descriptions"),
			),
		).toBe(true);
		const execCalls = formattedExecCalls(run.context);
		expect(execCalls.filter((call) => call === "gt trunk --no-interactive")).toHaveLength(1);
		expect(execCalls).not.toContain("gt log --stack --reverse --no-interactive");
		expect(execCalls).not.toContain("gt branch info --no-interactive");
		expect(execCalls).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
	});
});

async function createFlowProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-flow-extension-project-"));
	tempDirs.push(directory);
	installCheckedInFlowExtension(directory);
	await appendFile(
		join(directory, "ns.toml"),
		'\n[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
	);
	return directory;
}

async function createFlowProjectWithGraphiteStack(): Promise<string> {
	const directory = await createFlowProject();
	const gitDir = join(directory, ".git");
	await mkdir(gitDir, { recursive: true });
	execFileSync("sqlite3", [join(gitDir, ".graphite_metadata.db")], {
		input: [
			"CREATE TABLE branch_metadata (branch_name TEXT PRIMARY KEY, parent_branch_name TEXT, children TEXT, validation_result TEXT);",
			`INSERT INTO branch_metadata VALUES ('main', NULL, '["feature/demo"]', 'TRUNK');`,
			`INSERT INTO branch_metadata VALUES ('feature/demo', 'main', '[]', 'VALID');`,
		].join("\n"),
	});
	return directory;
}

function runWithRealFlowExtension(options: {
	args: readonly string[];
	cwd: string;
	state?: Parameters<typeof runCliWithFakes>[0]["state"];
	renderCapabilities?: Parameters<typeof runCliWithFakes>[0]["renderCapabilities"];
}) {
	return runCliWithFakes(
		{
			args: options.args,
			cwd: options.cwd,
			...(options.state === undefined ? {} : { state: options.state }),
			...(options.renderCapabilities === undefined
				? {}
				: { renderCapabilities: options.renderCapabilities }),
		},
		{
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: true, text: "Generated PR\n\nGenerated body" }),
		},
	);
}

function dirtyCpExecResponses(
	cwd: string,
	logHeadline = "abc123 [cp] Update checkpoint",
): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: `${logHeadline}\n` } },
	];
}

function successfulSubmitResponses(cwd: string): ScriptedExecResponse[] {
	return [
		...cleanCheckpointResponses(cwd),
		{
			match:
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			result: { stdout: "ready\n" },
		},
		{ match: "git rev-parse --git-common-dir", result: { stdout: `${join(cwd, ".git")}\n` } },
		{ match: "git branch --show-current", result: { stdout: "feature/demo\n" } },
		{
			match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
			result: { stdout: JSON.stringify([{ number: 123, url: PR_URL }]) },
		},
		{
			match:
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			result: { stdout: "ready\n" },
		},
		{
			match: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			result: { stdout: `Submitted ${PR_URL}\n` },
		},
		{
			match: "gh pr view --json number,url",
			result: { stdout: JSON.stringify({ number: 123, url: PR_URL }) },
		},
		{
			match: "gh pr list --head feature/demo --state open --limit 2 --json number,url",
			result: { stdout: JSON.stringify([{ number: 123, url: PR_URL }]) },
		},
		{
			match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: "Hand edited body" }) },
		},
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
	];
}

function cleanCheckpointResponses(cwd: string): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
	];
}

function prJson(options: { body: string }): string {
	return JSON.stringify({
		number: 123,
		url: PR_URL,
		title: "Existing PR title",
		body: options.body,
		headRefName: "feature/demo",
		baseRefName: "main",
	});
}

function commitsJson(): string {
	return JSON.stringify({
		commits: [{ messageHeadline: "Add submit", messageBody: "Body from commit" }],
	});
}
