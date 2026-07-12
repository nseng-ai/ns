import { mkdtemp, rm } from "node:fs/promises";
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
		expect(help.stdout.join("")).toContain("NS_CHECKPOINT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "cp", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader reaches a simple cp invocation path", async () => {
		const cwd = await createFlowProject();
		const run = runWithRealFlowExtension({
			args: ["flow", "cp"],
			cwd,
			state: {
				exec: dirtyCpExecResponses(),
				textGeneration: [
					{
						ok: true,
						text: `[cp] Update integration checkpoint\n\n- Cover loader invocation`,
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("abc123 [cp] Update checkpoint");
		expect(formattedExecCalls(run.context)).toContain("git add -A");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
	});

	test("real loader exposes changes help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "changes", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow changes");
		expect(output).toContain("read-only git commands");
		expect(output).toContain("NS_CHANGES_MODEL");
		expect(output).toContain("PI_DRAFT_MODEL");
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
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow branch-latest-commit");
		expect(output).toContain("--slug");
		expect(output).toContain("clean worktree");
		expect(output).toContain("latest eligible unpushed single-parent commit");
		expect(output).toContain("does not push, publish, submit, or update PRs");
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
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow autobranch");
		expect(output).toContain("--slug");
		expect(output).toContain("gt create");
		expect(output).toContain("dirty worktree changes");
		expect(output).toContain("ns flow branch-latest-commit");
		expect(output).not.toContain(["eligible unpushed", "non-merge commit"].join(" "));
		expect(output).toContain("NS_SLUG_MODEL");
		expect(output).toContain("NS_CHECKPOINT_MODEL");
		expect(output).toContain("NS_DEV_CHECKPOINT_MODEL");
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
		expect(output).toContain("Regenerate the current branch PR title");
		expect(output).toContain("--force");
		expect(output).toContain("NS_DEV_PR_DESCRIPTION_MODEL");
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
		expect(output).toContain("NS_DEV_PR_DESCRIPTION_MODEL");
		expect(output).toContain("NS_SUBMIT_FAILURE_LOG_DIR");
		expect(help.stderr.join("")).toBe("");
	});

	test("real loader reaches a simple submit invocation path", async () => {
		const cwd = await createFlowProject();
		const run = runWithRealFlowExtension({
			args: ["flow", "submit"],
			cwd,
			state: {
				exec: successfulSubmitResponses(),
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
		expect(formattedExecCalls(run.context)).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
	});
});

async function createFlowProject(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-flow-extension-project-"));
	tempDirs.push(directory);
	installCheckedInFlowExtension(directory);
	return directory;
}

function runWithRealFlowExtension(options: {
	args: readonly string[];
	cwd: string;
	state?: Parameters<typeof runCliWithFakes>[0]["state"];
}) {
	return runCliWithFakes(
		{
			args: options.args,
			cwd: options.cwd,
			...(options.state === undefined ? {} : { state: options.state }),
		},
		{
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: true, text: "Generated PR\n\nGenerated body" }),
		},
	);
}

function dirtyCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function successfulSubmitResponses(): ScriptedExecResponse[] {
	return [
		...cleanCheckpointResponses(),
		{
			match:
				"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run",
			result: { stdout: "ready\n" },
		},
		{
			match: "gt log --stack --reverse --no-interactive",
			result: { stdout: "◯ main\n◉ feature/demo (current)\n" },
		},
		{ match: "gt trunk --no-interactive", result: { stdout: "main\n" } },
		{
			match: "gt branch info --no-interactive --branch feature/demo",
			result: { stdout: `Parent: main\nPR: ${PR_URL}\n` },
		},
		{
			match: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
			result: { stdout: `Submitted ${PR_URL}\n` },
		},
		{ match: "gt branch info --no-interactive", result: { stdout: `Current PR: ${PR_URL}\n` } },
		{
			match: "gh pr view 123 --json number,url,title,body,headRefName,baseRefName",
			result: { stdout: prJson({ body: "Hand edited body" }) },
		},
		{ match: "gh pr view 123 --json commits", result: { stdout: commitsJson() } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "gh pr diff 123", result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" } },
		{
			match: "git patch-id --stable",
			result: { stdout: "default-patch-id 0000000000000000000000000000000000000000\n" },
		},
		{ match: /^gh pr edit 123 --title Generated PR --body-file /, result: {} },
	];
}

function cleanCheckpointResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: "" } },
		{ match: "git diff HEAD --no-ext-diff", result: { stdout: "" } },
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
