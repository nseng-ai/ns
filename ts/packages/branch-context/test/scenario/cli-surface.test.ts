import { describe, expect, test } from "vitest";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

import { BRANCH_CONTEXT_NAMESPACE } from "../../src/constants.ts";
import { PLAN_KEY, PLAN_SLUG, START_POINT, expectNoGitOrBrmemCalls, jsonFailure, makeTempDir, parseJson, runWithFakes } from "../support/cli-harness.ts";

const TOP_LEVEL_HELP = [
	"Usage: branch-context [options] [command]",
	"",
	"Branch context operations.",
	"",
	"Options:",
	"  -V, --version  Show the package version.",
	"  --runtime      Show CLI runtime diagnostics and exit.",
	"  -h, --help     display help for command",
	"",
].join("\n");
// PINNED CLINKR SEMANTICS: the hidden exec subgroup is omitted from top-level help.

const EXEC_HELP = [
	"Usage: branch-context exec [options] [command]",
	"",
	"Run hidden deterministic branch-context operations for agents.",
	"",
	"Options:",
	"  -h, --help              display help for command",
	"",
	"Commands:",
	"  from-plan [options]     Create a branch context from a saved plan.",
	"  load [options] [key]    Load a branch-context entry and render the",
	"                          implementation prompt.",
	"  attach [options] [key]  Attach a saved plan or file as branch context.",
	"  list [options]          List branch-context entries.",
	"  check [options] [key]   Check whether a branch-context entry exists.",
	"  delete [options] [key]  Delete a branch-context entry.",
	"",
].join("\n");

const CREATE_HELP = [
	"Usage: branch-context exec from-plan [options]",
	"",
	"Create a branch context from a saved plan.",
	"",
	"Options:",
	"  --slug <value>             Branch context slug.",
	"  --plan-file <value>        Plan file path (must live outside the repository).",
	"  --branch <value>           Branch name (defaults to the slug).",
	'  --branch-creation <value>  Branch creation method. (default: "plain-git")',
	'                             (choices: "plain-git", "graphite")',
	"  --summary <value>          Optional plan summary.",
	'  --format <format>          Output format. (choices: "human", "json",',
	'                             "markdown", "md", default: "human")',
	"  --shell-exit-code          Use shell-visible Clinkr semantic exit codes;",
	"                             negative exits 1 instead of 0.",
	"  --json-schema              Print the JSON Schema for this command's",
	"                             input/output and exit.",
	"  -h, --help                 display help for command",
	"",
].join("\n");

const LOAD_PLAN_HELP = [
	"Usage: branch-context exec load [options] [key]",
	"",
	"Load a branch-context entry and render the implementation prompt.",
	"",
	"Arguments:",
	"  key                    Branch-context key (defaults to the only attached",
	"                         entry).",
	"",
	"Options:",
	"  --prompt-file <value>  Write the implementation prompt to this file.",
	"  --include-content      Include the branch-context entry content in JSON",
	"                         output.",
	"  --include-prompt       Include the implementation prompt in JSON output.",
	'  --format <format>      Output format. (choices: "human", "json", "markdown",',
	'                         "md", default: "human")',
	"  --shell-exit-code      Use shell-visible Clinkr semantic exit codes; negative",
	"                         exits 1 instead of 0.",
	"  --json-schema          Print the JSON Schema for this command's input/output",
	"                         and exit.",
	"  -h, --help             display help for command",
	"",
].join("\n");


describe("branch-context CLI help, version, and dispatch pins", () => {
	test.each([[[]], [["-h"]], [["--help"]]])("pins top-level help for %j", async (args) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(TOP_LEVEL_HELP);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test.each([[["-V"]], [["--version"]]])("pins version output for %j", async (args) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("0.1.0\n");
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("pins --runtime output", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["--runtime"], { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			"runtime: typescript\nentry_point: @asdl/branch-context bin branch-context -> ts/packages/branch-context/src/cli.ts\n",
		);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test.each([
		[["exec"], EXEC_HELP],
		[["exec", "--help"], EXEC_HELP],
		[["exec", "-h"], EXEC_HELP],
		[["exec", "from-plan", "--help"], CREATE_HELP],
		[["exec", "from-plan", "-h"], CREATE_HELP],
		[["exec", "load", "--help"], LOAD_PLAN_HELP],
		[["exec", "load", "-h"], LOAD_PLAN_HELP],
	])("prints exact help for %j", async (args, help) => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(args, { cwd: repoRoot });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(help);
		expect(run.stderr.join("")).toBe("");
		expectNoGitOrBrmemCalls(run);
	});

	test("pins unknown command and unknown exec operation stderr", async () => {
		const repoRoot = await makeTempDir();
		const unknown = runWithFakes(["bogus"], { cwd: repoRoot });
		expect(await unknown.exit).toBe(2);
		expect(unknown.stdout.join("")).toBe("");
		expect(unknown.stderr.join("")).toBe("error: unknown command 'bogus'\n");

		const unknownExec = runWithFakes(["exec", "bogus"], { cwd: repoRoot });
		expect(await unknownExec.exit).toBe(2);
		expect(unknownExec.stderr.join("")).toBe("error: unknown command 'bogus'\n");

		const unknownExecJson = runWithFakes(["exec", "bogus", "--format", "json"], { cwd: repoRoot });
		expect(await unknownExecJson.exit).toBe(2);
		expect(unknownExecJson.stdout.join("")).toBe("");
		expect(unknownExecJson.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown exec operations bypass --format json.
	});
});


describe("branch-context CLI parse failures", () => {
	test("reports missing flag values as raw stderr without running commands", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan", "--slug"], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: option '--slug <value>' argument missing\n");
		expect(run.commands.execCalls).toEqual([]);
	});

	test("missing flag value before --format json consumes the next flag", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan", "--slug", "--format", "json"], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: too many arguments for 'from-plan'. Expected 0 arguments but got 1.\n");
		expect(run.commands.execCalls).toEqual([]);
		// PINNED QUIRK (clinkr-migration): commander consumes "--format" as the --slug
		// value, leaving "json" as an excess positional; usage errors stay raw stderr.
	});

	test("reports missing required options as zod usage errors", async () => {
		const repoRoot = await makeTempDir();
		const run = runWithFakes(["exec", "from-plan"], { cwd: repoRoot });

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			[
				"error: --slug: Invalid input: expected string, received undefined",
				"error: --plan-file: Invalid input: expected string, received undefined",
				"",
			].join("\n"),
		);
		expect(run.commands.execCalls).toEqual([]);
	});

	test("reports unknown options as raw stderr in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const human = runWithFakes(["exec", "load", "--bogus"], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		expect(human.commands.execCalls).toEqual([]);

		const json = runWithFakes(["exec", "load", "--format", "json", "--bogus"], { cwd: repoRoot });
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe("");
		expect(json.stderr.join("")).toBe("error: unknown option '--bogus'\n");
		expect(json.commands.execCalls).toEqual([]);
		// PINNED CLINKR SEMANTICS: usage errors are raw stderr, never JSON-enveloped.
	});

	test("pins invalid branch context slug failures in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const message = "Invalid branch context slug: Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens.";
		const human = runWithFakes(["exec", "from-plan", "--slug", "Not-Kebab-Case", "--plan-file", "/tmp/plan.md"], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe(`error: ${message}\n`);

		const json = runWithFakes(["exec", "from-plan", "--slug", "Not-Kebab-Case", "--plan-file", "/tmp/plan.md", "--format", "json"], { cwd: repoRoot });
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe(jsonFailure(message));
		expect(json.stderr.join("")).toBe("");
	});
});


describe("branch-context CLI surface pinning", () => {
	test("accepts inline equals syntax for create flags", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const run = runWithFakes(["exec", "from-plan", `--slug=${PLAN_SLUG}`, `--plan-file=${planFile}`, "--format=json"], {
			cwd: repoRoot,
			git: { headCommit: START_POINT },
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({ success: true, slug: PLAN_SLUG, branch: PLAN_SLUG, source_file: planFile });
		// PINNED CLINKR SEMANTICS: commander accepts --flag=value syntax.
	});

	test("last duplicate --slug wins in create JSON output", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const run = runWithFakes(
			["exec", "from-plan", "--slug", "first-branch-plan", "--slug", PLAN_SLUG, "--plan-file", planFile, "--format", "json"],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toEqual({
			success: true,
			slug: PLAN_SLUG,
			branch: PLAN_SLUG,
			branch_creation: "plain-git",
			start_point: START_POINT,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${PLAN_SLUG}:${PLAN_KEY}`,
			commit: "abc123",
			source_file: planFile,
		});
		// PINNED QUIRK (clinkr-migration): duplicate scalar flags are accepted and the last value wins.
	});

	test("pins invalid branch-creation as a raw commander choices error in human and JSON modes", async () => {
		const repoRoot = await makeTempDir();
		const message = "error: option '--branch-creation <value>' argument 'bogus' is invalid. Allowed choices are plain-git, graphite.\n";
		const human = runWithFakes(["exec", "from-plan", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus"], { cwd: repoRoot });
		expect(await human.exit).toBe(2);
		expect(human.stdout.join("")).toBe("");
		expect(human.stderr.join("")).toBe(message);

		const json = runWithFakes(["exec", "from-plan", "--slug", PLAN_SLUG, "--plan-file", "/tmp/plan.md", "--branch-creation", "bogus", "--format", "json"], {
			cwd: repoRoot,
		});
		expect(await json.exit).toBe(2);
		expect(json.stdout.join("")).toBe("");
		expect(json.stderr.join("")).toBe(message);
		// PINNED CLINKR SEMANTICS: enum choice errors are raw stderr, never JSON-enveloped.
	});

	test("accepts --format human explicitly", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n";
		const run = runWithFakes(["exec", "load", "--format", "human"], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain(`Selected key: ${PLAN_KEY}`);
		// PINNED CLINKR SEMANTICS: --format human is an accepted choice (was rejected pre-migration).
	});

	test("create flags are order-independent and success JSON is byte-exact", async () => {
		const repoRoot = await makeTempDir();
		const outsideDir = await makeTempDir();
		const planFile = join(outsideDir, "plan.md");
		await writeFile(planFile, "# Plan\n", "utf8");
		const branch = "branch-contexts/branch-scoped-plan";
		const run = runWithFakes(
			[
				"exec",
				"from-plan",
				"--format",
				"json",
				"--branch-creation",
				"plain-git",
				"--plan-file",
				planFile,
				"--summary",
				"Create it",
				"--branch",
				branch,
				"--slug",
				PLAN_SLUG,
			],
			{ cwd: repoRoot, git: { headCommit: START_POINT } },
		);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(
			`${JSON.stringify({
				success: true,
				slug: PLAN_SLUG,
				branch,
				branch_creation: "plain-git",
				start_point: START_POINT,
				namespace: BRANCH_CONTEXT_NAMESPACE,
				key: PLAN_KEY,
				ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
				commit: "abc123",
				source_file: planFile,
				summary: "Create it",
			})}\n`,
		);
	});

	test("pins load positional placement and duplicate positional error", async () => {
		const repoRoot = await makeTempDir();
		const branch = "branch-contexts/branch-scoped-plan";
		const content = "# Attached Plan\n";
		const placedAfterFlag = runWithFakes(["exec", "load", "--format", "json", PLAN_KEY], {
			cwd: repoRoot,
			git: { currentBranch: branch, trunkBranch: "main" },
			brmem: { entries: [{ branch, key: PLAN_KEY, content }] },
		});
		expect(await placedAfterFlag.exit).toBe(0);
		expect(parseJson(placedAfterFlag)).toEqual({
			success: true,
			branch,
			namespace: BRANCH_CONTEXT_NAMESPACE,
			selected_key: PLAN_KEY,
			ref_name: `refs/brmem/ns/${BRANCH_CONTEXT_NAMESPACE}/${branch.replaceAll("/", "---")}:${PLAN_KEY}`,
			byte_count: content.length,
			available_keys: [PLAN_KEY],
			source: "attached",
		});

		const duplicate = runWithFakes(["exec", "load", PLAN_KEY, "other-plan", "--format", "json"], { cwd: repoRoot });
		expect(await duplicate.exit).toBe(2);
		expect(duplicate.stdout.join("")).toBe("");
		expect(duplicate.stderr.join("")).toBe("error: too many arguments for 'load'. Expected 1 argument but got 2.\n");
		// PINNED CLINKR SEMANTICS: excess positionals are a raw commander usage error, never JSON-enveloped.
	});
});
