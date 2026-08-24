import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { NsProgressPhaseEvent } from "@nseng-ai/sdk";

import { installCheckedInFlowExtension } from "../helpers/flow-extension.ts";
import {
	formattedExecCalls,
	parseJsonOutput,
	runCliWithFakes,
	type ScriptedExecResponse,
} from "../scenario/ns-cli-fakes.ts";

const FALLBACK_WARNING =
	"No configured fast model profile was found; using built-in openai-codex/gpt-5.6-luna with minimal thinking.\n";
const PR_URL = "https://github.com/acme/repo/pull/123";
const ansiCaps: Caps = {
	isTty: true,
	colorDepth: "truecolor",
	columns: 80,
	canRenderUnicode: true,
};
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
		expect(help.stdout.join("")).toContain("-n, --dry-run");
		expect(help.stdout.join("")).toContain("-f, --force");
		expect(help.stdout.join("")).not.toContain("NS_CHECKPOINT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "cp", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader hosts typed Graphite metadata rows through the filesystem route", async () => {
		const cwd = await createFlowProject();
		const dbPath = join(cwd, ".git", ".graphite_metadata.db");
		const sqliteRows = [
			{
				branch_name: "main",
				parent_branch_name: null,
				children: "[]",
				validation_result: "TRUNK",
			},
		];
		const sqliteCommand = [
			"sqlite3",
			"-readonly",
			"-json",
			dbPath,
			"SELECT branch_name, parent_branch_name, children, validation_result FROM branch_metadata",
		].join(" ");
		const run = runWithRealFlowExtension({
			args: [
				"flow",
				"exec",
				"read-graphite-branch-metadata",
				"--db-path",
				dbPath,
				"--format",
				"json",
			],
			cwd,
			state: { exec: [{ match: sqliteCommand, result: { stdout: JSON.stringify(sqliteRows) } }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(parseJsonOutput(run)).toEqual({ status: "success", exitCode: 0, data: sqliteRows });
		expect(formattedExecCalls(run.context)).toEqual([sqliteCommand]);

		const schema = runWithRealFlowExtension({
			args: ["flow", "exec", "read-graphite-branch-metadata", "--db-path", dbPath, "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(schema.stderr.join("")).toBe("");
		const schemaDocument = parseJsonOutput(schema);
		expect(schemaDocument.outputJsonSchema).toMatchObject({ type: "array" });
		expect(schemaDocument.machineEnvelopeJsonSchema).toMatchObject({
			anyOf: expect.arrayContaining([
				expect.objectContaining({
					properties: expect.objectContaining({
						status: expect.objectContaining({ const: "success" }),
						exitCode: expect.objectContaining({ const: 0 }),
						data: expect.objectContaining({ type: "array" }),
					}),
				}),
			]),
		});
		expect(schema.context.execCalls).toEqual([]);
	});

	test("real loader reaches a simple cp invocation path", async () => {
		const cwd = await createFlowProject({ includeModels: false });
		const run = runWithRealFlowExtension({
			args: ["flow", "cp"],
			cwd,
			state: {
				exec: dirtyCpExecResponses(cwd),
				textGeneration: [
					{
						ok: true,
						text: `[cp] Update integration checkpoint\n\n- Cover loader invocation`,
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("abc123 [cp] Update checkpoint");
		expect(stdout).not.toMatch(/^"/u);
		expect(stdout).not.toContain("\\u001b");
		expect(stdout).not.toContain("\\n");
		expect(formattedExecCalls(run.context)).toContain(
			"git symbolic-ref --short refs/remotes/origin/HEAD",
		);
		expect(formattedExecCalls(run.context)).toContain("git add -A");
		expect(run.context.textGeneratorCalls).toHaveLength(1);
		expect(run.context.textGeneratorCalls[0]?.modelSelection).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal",
		});
		expect(run.stderr).toEqual([FALLBACK_WARNING]);
	});

	test("real loader transfers inherited TTY progress presentation to its host", async () => {
		const cwd = await createFlowProject();
		const events: NsProgressPhaseEvent[] = [];
		const run = runWithRealFlowExtension({
			args: ["flow", "cp"],
			cwd,
			renderCapabilities: { canEmitAnsi: false, caps: ansiCaps },
			onProgress: (event) => events.push(event),
			state: {
				exec: dirtyCpExecResponses(cwd),
				textGeneration: [
					{
						ok: true,
						text: `[cp] Update integration checkpoint\n\n- Cover hosted progress ownership`,
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(events[0]?.type).toBe("phases-declared");
		expect(events.some((event) => event.type === "phase-started")).toBe(true);
		expect(run.liveOutput).toEqual([]);
		expect(run.stdout.join("")).toContain("abc123 [cp] Update checkpoint");
		expect(run.stderr.join("")).toBe("");
	});

	test("real loader renders pull-trunk terminal text and preserves its JSON envelope", async () => {
		const cwd = await createFlowProject();
		const state = { exec: successfulPullTrunkResponses(cwd) };
		const human = runWithRealFlowExtension({
			args: ["flow", "pull-trunk"],
			cwd,
			state,
			renderCapabilities: { canEmitAnsi: true, caps: ansiCaps },
		});

		expect(await human.exit).toBe(0);
		expect(human.stderr.join("")).toBe("");
		const stdout = human.stdout.join("");
		expect(stdout.startsWith("\u001b[")).toBe(true);
		expect(stripAnsi(stdout).startsWith("✓ Pulled local Git trunk branch `main` only.")).toBe(true);
		expect(stdout).not.toMatch(/^"/u);
		expect(stdout).not.toContain("\\u001b");
		expect(stdout).not.toContain("\\n");
		expect(stripAnsi(stdout)).toBe(
			[
				"✓ Pulled local Git trunk branch `main` only.",
				"No full `gt sync` was run.",
				"Command: git fetch origin refs/heads/main:refs/heads/main",
				`Cwd: ${cwd}`,
				"",
			].join("\n"),
		);

		const json = runWithRealFlowExtension({
			args: ["--format", "json", "flow", "pull-trunk"],
			cwd,
			state: { exec: successfulPullTrunkResponses(cwd) },
			renderCapabilities: { canEmitAnsi: true, caps: ansiCaps },
		});
		expect(await json.exit).toBe(0);
		expect(json.stderr.join("")).toBe("");
		const envelope = parseJsonOutput(json);
		expect(envelope).toEqual({
			status: "success",
			exitCode: 0,
			data: {
				trunk: "main",
				cwd,
				command: "git fetch origin refs/heads/main:refs/heads/main",
			},
		});
	});

	test("real loader emits Graphite metadata as raw JSON text in human format", async () => {
		const cwd = await createFlowProject();
		const rows = [
			{
				branch_name: "main",
				parent_branch_name: null,
				children: "[]",
				validation_result: "TRUNK",
			},
		];
		const run = runWithRealFlowExtension({
			args: [
				"flow",
				"exec",
				"read-graphite-branch-metadata",
				"--db-path",
				join(cwd, ".git", ".graphite_metadata.db"),
			],
			cwd,
			state: {
				exec: [
					{
						match: /^sqlite3 -readonly -json /u,
						result: { stdout: `${JSON.stringify(rows)}\n` },
					},
				],
			},
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(JSON.parse(run.stdout.join(""))).toEqual(rows);
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
		expect(output).toContain("ns flow gt submit");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({ args: ["flow", "push", "--json-schema"], cwd });
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader exposes branch-latest-commit help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({
			args: ["flow", "gt", "branch-latest-commit", "--help"],
			cwd,
		});
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("").replace(/\s+/g, " ");
		expect(output).toContain("Usage: ns flow gt branch-latest-commit");
		expect(output).toContain("--slug");
		expect(output).toContain("clean worktree");
		expect(output).toContain("latest eligible single-parent commit");
		expect(output).toContain("has no upstream");
		expect(output).toContain("locally ahead of its locally known upstream");
		expect(output).toContain("exactly synchronized on a non-trunk branch");
		expect(output).toContain(
			"Remote-ahead, diverged, and exactly synchronized Git trunk states are refused",
		);
		expect(output).toContain(
			"Trunk identity comes from cached origin/HEAD, and upstream checks use only local tracking refs; neither check fetches",
		);
		expect(output).toContain("local-only Graphite branch");
		expect(output).toContain("does not fetch, push, publish, submit, or update PRs");
		expect(output).toContain("explicitly run `ns flow gt submit` from the new child");
		expect(output).toContain("ns flow gt autobranch");
		expect(output).not.toContain("stashes pending changes");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "gt", "branch-latest-commit", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(schema.stdout.join("")).toContain("latest commit");
		expect(schema.stdout.join("")).toContain("slug");
	});

	test("real loader exposes autobranch help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({ args: ["flow", "gt", "autobranch", "--help"], cwd });
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("").replace(/\s+/g, " ");
		expect(output).toContain("Usage: ns flow gt autobranch");
		expect(output).toContain("--slug");
		expect(output).toContain("gt create");
		expect(output).toContain("dirty worktree changes");
		expect(output).toContain("ns flow gt branch-latest-commit");
		expect(output).toContain("latest eligible commit");
		expect(output).not.toContain("eligible unpushed");
		expect(output).not.toContain("NS_SLUG_MODEL");
		expect(output).not.toContain("NS_CHECKPOINT_MODEL");
		expect(output).not.toContain("NS_DEV_CHECKPOINT_MODEL");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "gt", "autobranch", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(schema.stdout.join("")).toContain("slug");
	});

	test("real loader exposes Graphite autoslot help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();
		const help = runWithRealFlowExtension({
			args: ["flow", "gt", "autoslot", "--help"],
			cwd,
		});

		expect(await help.exit).toBe(0);
		const output = help.stdout.join("").replace(/\s+/g, " ");
		expect(output).toContain("Usage: ns flow gt autoslot");
		expect(output).toContain("--slug");
		expect(output).toContain("managed slot worktree");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "gt", "autoslot", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
		expect(parseJsonOutput(schema)).toHaveProperty("machineEnvelopeJsonSchema");
	});

	test.each(["autobranch", "branch-latest-commit", "autoslot", "submit", "land", "squash-stack"])(
		"real loader does not retain the removed flat flow %s route",
		async (command) => {
			const cwd = await createFlowProject();
			const run = runWithRealFlowExtension({ args: ["flow", command, "--help"], cwd });

			expect(await run.exit).toBe(0);
			expect(run.stdout.join("")).toContain("Usage: ns flow");
			expect(run.stdout.join("")).not.toContain(`Usage: ns flow ${command}`);
			expect(run.stderr.join("")).toBe("");
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.textGeneratorCalls).toEqual([]);
		},
	);

	test("real loader rejects unexpected push arguments before git or model calls", async () => {
		const cwd = await createFlowProject();
		const run = runWithRealFlowExtension({ args: ["flow", "push", "unexpected"], cwd });

		expect(await run.exit).not.toBe(0);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).not.toBe("");
		expect(run.context.execCalls).toEqual([]);
		expect(run.context.textGeneratorCalls).toEqual([]);
	});

	test("real loader exposes generate-pr-inventory help and JSON schema metadata", async () => {
		const cwd = await createFlowProject();

		const help = runWithRealFlowExtension({
			args: ["flow", "generate-pr-inventory", "--help"],
			cwd,
		});
		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow generate-pr-inventory");
		expect(output).toContain(
			"Generate and completely replace the current branch PR title and body",
		);
		expect(output).toContain("--yes");
		expect(output).toContain("-y");
		expect(output).not.toContain("--force");
		expect(output).not.toContain("NS_DEV_PR_DESCRIPTION_MODEL");
		expect(output).toContain("NS_FLOW_PR_INVENTORY_PROMPT");
		expect(help.stderr.join("")).toBe("");

		const schema = runWithRealFlowExtension({
			args: ["flow", "generate-pr-inventory", "--json-schema"],
			cwd,
		});
		expect(await schema.exit).toBe(0);
		expect(parseJsonOutput(schema)).toHaveProperty("inputJsonSchema");
	});

	test("real loader exposes submit help metadata", async () => {
		const cwd = await createFlowProject();
		const help = runWithRealFlowExtension({ args: ["flow", "gt", "submit", "--help"], cwd });

		expect(await help.exit).toBe(0);
		const output = help.stdout.join("");
		expect(output).toContain("Usage: ns flow gt submit");
		expect(output).toContain("--no-restack");
		expect(output).toContain("--force");
		expect(output).toContain("--verbose");
		expect(output).not.toContain("--minimal");
		expect(output).not.toMatch(/(?:^|\s)-m(?:,|\s|$)/mu);
		expect(output).not.toContain("NS_DEV_PR_DESCRIPTION_MODEL");
		expect(help.stderr.join("")).toBe("");
	});

	test.each(["--minimal", "-m"])(
		"real loader rejects removed submit option %s before command or model calls",
		async (option) => {
			const cwd = await createFlowProject();
			const run = runWithRealFlowExtension({ args: ["flow", "gt", "submit", option], cwd });

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
			args: ["flow", "gt", "submit"],
			cwd,
			state: {
				exec: successfulSubmitResponses(cwd),
				textGeneration: [{ ok: true, text: "Generated PR\n\nGenerated body" }],
			},
		});

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("Submitted 1 PR:");
		expect(stdout).toContain(`✓ #123 ${PR_URL}`);
		expect(stdout).not.toMatch(/(?:^|\n)""\n$/u);
		expect(run.liveOutput).toContainEqual({
			stream: "stderr",
			text: "gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web\n",
		});
		expect(
			run.liveOutput.some(
				(entry) =>
					entry.stream === "stderr" &&
					entry.text.includes("ns flow gt submit") &&
					entry.text.includes("Inventories"),
			),
		).toBe(true);
		const execCalls = formattedExecCalls(run.context);
		expect(
			execCalls.filter((call) => call === "git symbolic-ref --short refs/remotes/origin/HEAD"),
		).toHaveLength(1);
		expect(execCalls).not.toContain("gt log --stack --reverse --no-interactive");
		expect(execCalls).not.toContain("gt branch info --no-interactive");
		expect(execCalls).toContain(
			"gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web",
		);
	});
});

async function createFlowProject(options: { includeModels?: boolean } = {}): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ns-flow-extension-project-"));
	tempDirs.push(directory);
	installCheckedInFlowExtension(directory);
	if (options.includeModels !== false) {
		await appendFile(
			join(directory, "ns.toml"),
			'\n[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
	}
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
	onProgress?: Parameters<typeof runCliWithFakes>[0]["onProgress"];
}) {
	return runCliWithFakes(
		{
			args: options.args,
			cwd: options.cwd,
			...(options.state === undefined ? {} : { state: options.state }),
			...(options.renderCapabilities === undefined
				? {}
				: { renderCapabilities: options.renderCapabilities }),
			...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
		},
		{
			execResponses: () => [],
			textGenerationResults: () => [],
			missingTextGenerationResult: () => ({ ok: true, text: "Generated PR\n\nGenerated body" }),
		},
	);
}

function successfulPullTrunkResponses(cwd: string): ScriptedExecResponse[] {
	return [
		{
			match: "git symbolic-ref --short refs/remotes/origin/HEAD",
			result: { stdout: "origin/main\n" },
		},
		{
			match:
				"git for-each-ref --format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref) refs/heads/main",
			result: { stdout: "refs/heads/main\0origin\0refs/heads/main\n" },
		},
		{
			match: "git worktree list --porcelain",
			result: {
				stdout: `worktree ${cwd}\nHEAD abc123\nbranch refs/heads/feature/demo\n`,
			},
		},
		{ match: "git fetch origin refs/heads/main:refs/heads/main", result: {} },
	];
}

function dirtyCpExecResponses(cwd: string): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git rev-parse --show-toplevel", result: { stdout: `${cwd}\n` } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{
			match: "git symbolic-ref --short refs/remotes/origin/HEAD",
			result: { stdout: "origin/main\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
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
		{
			match: "git symbolic-ref --short refs/remotes/origin/HEAD",
			result: { stdout: "origin/main\n" },
		},
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
