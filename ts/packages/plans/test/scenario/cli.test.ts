import { afterEach, describe, expect, test } from "vitest";
import { mkdir, readFile, realpath, stat, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import { type CommandExecApi, type ExecOptions } from "@asdl/core/exec";
import type { GitGateway } from "@asdl/core/git";
import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { createTempDirTracker } from "@asdl/core/testing";

import { buildRepoPlanStoreKey, encodeBranchForPlanPath, runCli } from "../../src/index.ts";

const ORIGIN = "git@github.com:Owner/Repo.git";
const SOURCE_BRANCH = "feature/source-plan";
const MODIFIED_TIME_MS = 1_700_000_000_000;

const TOP_LEVEL_HELP = [
	"Usage: enriched-plan [options] [command]",
	"",
	"Enriched-plan operations. An enriched plan is any plan saved into asdl.",
	"",
	"Options:",
	"  -V, --version   Show the package version.",
	"  --runtime       Show CLI runtime diagnostics and exit.",
	"  -h, --help      display help for command",
	"",
	"Commands:",
	"  list [options]  List saved plans for the current repository across all branch",
	"                  keys.",
	"",
].join("\n");

const LIST_HELP = [
	"Usage: enriched-plan list [options]",
	"",
	"List saved plans for the current repository across all branch keys.",
	"",
	"Options:",
	"  --plan-store-root <value>  Plan store root directory (relative paths resolve",
	"                             against cwd).",
	"  --format <format>          Output format. (choices: \"human\", \"json\",",
	"                             \"markdown\", \"md\", default: \"human\")",
	"  --shell-exit-code          Use shell-visible Clinkr semantic exit codes;",
	"                             negative exits 1 instead of 0.",
	"  --json-schema              Print the JSON Schema for this command's",
	"                             input/output and exit.",
	"  -h, --help                 display help for command",
	"",
].join("\n");
const EXEC_HELP = [
	"Usage: enriched-plan exec [options] [command]",
	"",
	"Run hidden deterministic saved-plan operations for agents.",
	"",
	"Options:",
	"  -h, --help                display help for command",
	"",
	"Commands:",
	"  save [options]            Save a source-branch plan file in the local store.",
	"  resolve [options] [path]  Resolve an explicit or latest source-branch plan",
	"                            file.",
	"",
].join("\n");
const SAVE_HELP = [
	"Usage: enriched-plan exec save [options]",
	"",
	"Save a source-branch plan file in the local store.",
	"",
	"Options:",
	"  --slug <value>          Saved plan slug.",
	"  --summary <value>       Optional saved-plan summary.",
	"  --stdin                 Read plan content from stdin.",
	"  --content-file <value>  Read plan content from this file path.",
	"  --format <format>       Output format. (choices: \"human\", \"json\", \"markdown\",",
	"                          \"md\", default: \"human\")",
	"  --shell-exit-code       Use shell-visible Clinkr semantic exit codes; negative",
	"                          exits 1 instead of 0.",
	"  --json-schema           Print the JSON Schema for this command's input/output",
	"                          and exit.",
	"  -h, --help              display help for command",
	"",
].join("\n");
const RESOLVE_HELP = [
	"Usage: enriched-plan exec resolve [options] [path]",
	"",
	"Resolve an explicit or latest source-branch plan file.",
	"",
	"Arguments:",
	"  path               Absolute, @-prefixed, or home-relative plan file path.",
	"",
	"Options:",
	"  --format <format>  Output format. (choices: \"human\", \"json\", \"markdown\", \"md\",",
	"                     default: \"human\")",
	"  --shell-exit-code  Use shell-visible Clinkr semantic exit codes; negative",
	"                     exits 1 instead of 0.",
	"  --json-schema      Print the JSON Schema for this command's input/output and",
	"                     exit.",
	"  -h, --help         display help for command",
	"",
].join("\n");

const tempDirs = createTempDirTracker();

afterEach(async () => {
	await tempDirs.cleanup();
});

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
}

interface Fixture {
	repoRoot: string;
	planStoreRoot: string;
	repoKey: string;
	branchKey: string;
	git: GitGateway;
}

interface RunWithFakesOptions {
	cwd?: string;
	planStoreRoot?: string;
	stdin?: () => Promise<string>;
	git?: GitGateway;
}

async function runWithFakes(args: readonly string[], options: RunWithFakesOptions = {}): Promise<CliRun> {
	const cwd = options.cwd ?? (await makeTempDir());
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		exit: runCli(args, {
			cwd,
			git: options.git ?? new InMemoryGitGateway({ repoRoot: cwd, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }),
			commands: unusedCommands,
			stdin: options.stdin,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			...(options.planStoreRoot === undefined ? {} : { planStoreRoot: options.planStoreRoot }),
		}),
	};
}

async function makeFixture(): Promise<Fixture> {
	const repoRoot = await makeTempDir();
	const planStoreRoot = await makeTempDir();
	const repoKey = buildRepoPlanStoreKey(repoRoot, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	return { repoRoot, planStoreRoot, repoKey, branchKey, git: new InMemoryGitGateway({ repoRoot, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }) };
}

async function makeTempDir(prefix = "plans-cli-scenario-"): Promise<string> {
	return tempDirs.makeTempDir(prefix);
}

async function makeHomeTempDir(): Promise<string> {
	return tempDirs.makeHomeTempDir(".plans-cli-scenario-");
}

async function writePlanFile(fixture: Fixture, fileName: string, modifiedTimeMs = MODIFIED_TIME_MS): Promise<string> {
	const directory = join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey);
	await mkdir(directory, { recursive: true });
	const filePath = join(directory, fileName);
	await writeFile(filePath, `# ${fileName}\n`, "utf8");
	const modified = new Date(modifiedTimeMs);
	await utimes(filePath, modified, modified);
	return filePath;
}

function jsonFailure(message: string): string {
	return `${JSON.stringify({ success: false, error: { code: "plans_error", message } })}\n`;
}

function parseJson(run: CliRun): Record<string, unknown> {
	const value: unknown = JSON.parse(run.stdout.join(""));
	if (!isRecord(value)) throw new Error("Expected JSON object output.");
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

const unusedCommands: CommandExecApi = {
	exec(command: string, args: string[], options?: ExecOptions): Promise<never> {
		void command;
		void args;
		void options;
		throw new Error("Unexpected command execution in test.");
	},
};

describe("plans CLI help, version, and dispatch pins", () => {
	test.each([[[]], [["-h"]], [["--help"]]])("prints top-level help for %j", async (args) => {
		const run = await runWithFakes(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(TOP_LEVEL_HELP);
		expect(run.stderr.join("")).toBe("");
	});

	test("prints -V and ignores trailing version args", async () => {
		const short = await runWithFakes(["-V"]);
		expect(await short.exit).toBe(0);
		expect(short.stdout.join("")).toBe("0.1.0\n");

		const trailing = await runWithFakes(["--version", "extra-arg"]);
		expect(await trailing.exit).toBe(0);
		expect(trailing.stdout.join("")).toBe("0.1.0\n");
		// PINNED QUIRK (clinkr-migration): top-level --version ignores trailing arguments.
	});

	test("prints commander unknown command stderr", async () => {
		const run = await runWithFakes(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: unknown command 'bogus'\n");
	});

	test.each([
		[["list", "--help"], LIST_HELP],
		[["list", "-h"], LIST_HELP],
		[["exec"], EXEC_HELP],
		[["exec", "--help"], EXEC_HELP],
		[["exec", "-h"], EXEC_HELP],
		[["exec", "save", "--help"], SAVE_HELP],
		[["exec", "save", "-h"], SAVE_HELP],
		[["exec", "resolve", "--help"], RESOLVE_HELP],
		[["exec", "resolve", "-h"], RESOLVE_HELP],
	])("prints exact help for %j", async (args, help) => {
		const run = await runWithFakes(args);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(help);
		expect(run.stderr.join("")).toBe("");
	});

	test("pins bare exec exit 0 and unknown exec operation stderr", async () => {
		const bare = await runWithFakes(["exec"]);
		expect(await bare.exit).toBe(0);
		expect(bare.stdout.join("")).toBe(EXEC_HELP);

		const unknown = await runWithFakes(["exec", "bogus"]);
		expect(await unknown.exit).toBe(2);
		expect(unknown.stderr.join("")).toBe("error: unknown command 'bogus'\n");

		const unknownJson = await runWithFakes(["exec", "bogus", "--format", "json"]);
		expect(await unknownJson.exit).toBe(2);
		expect(unknownJson.stdout.join("")).toBe("");
		expect(unknownJson.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown exec operations bypass --format json.
	});
});

describe("plans list CLI pins", () => {
	test.each([
		[["list", "--bogus"], "error: unknown option '--bogus'\n"],
		[["list", "--format"], "error: option '--format <format>' argument missing\n"],
		[["list", "--format", "yaml"], "error: option '--format <format>' argument 'yaml' is invalid. Allowed choices are human, json, markdown, md.\n"],
		[["list", "--plan-store-root"], "error: option '--plan-store-root <value>' argument missing\n"],
	])("prints raw usage error for %j", async (args, message) => {
		const run = await runWithFakes(args);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(message);
	});

	test("accepts inline equals syntax for options", async () => {
		const run = await runWithFakes(["list", "--format=json"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`${JSON.stringify({ success: true, plans: [] })}\n`);
		expect(run.stderr.join("")).toBe("");
		// PINNED CLINKR SEMANTICS: commander accepts --flag=value syntax.
	});

	test("duplicate --format flags use commander last-wins validation", async () => {
		const run = await runWithFakes(["list", "--format", "json", "--format", "yaml"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("error: option '--format <format>' argument 'yaml' is invalid. Allowed choices are human, json, markdown, md.\n");
		// PINNED CLINKR SEMANTICS: usage errors are raw stderr, never JSON-enveloped.
	});

	test("prints one-plan JSON and human list byte-exactly", async () => {
		const fixture = await makeFixture();
		const filePath = await writePlanFile(fixture, "first-useful-saved-plan.md");
		const json = await runWithFakes(["list", "--format", "json", "--plan-store-root", fixture.planStoreRoot], { cwd: fixture.repoRoot, git: fixture.git });

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			`${JSON.stringify({
				success: true,
				plans: [
					{
						slug: "first-useful-saved-plan",
						branch_key: fixture.branchKey,
						modified_time_ms: MODIFIED_TIME_MS,
						path: filePath,
						file_name: "first-useful-saved-plan.md",
						repo: {
							root: fixture.repoRoot,
							key: fixture.repoKey,
							identity_source: "origin-url",
							plan_store_path: join(fixture.planStoreRoot, fixture.repoKey),
						},
					},
				],
			})}\n`,
		);

		const human = await runWithFakes(["list", "--plan-store-root", fixture.planStoreRoot], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toBe(
			[
				"Saved plans:",
				"- first-useful-saved-plan",
				`  Branch key: ${fixture.branchKey}`,
				"  Modified: 2023-11-14T22:13:20.000Z",
				`  Path: ${filePath}`,
				"",
			].join("\n"),
		);
	});

	test("relative --plan-store-root resolves against cwd", async () => {
		const fixture = await makeFixture();
		const relativeRoot = "relative-store";
		const absoluteRoot = join(fixture.repoRoot, relativeRoot);
		const filePath = await writePlanFile({ ...fixture, planStoreRoot: absoluteRoot }, "relative-root-plan-file.md");

		const run = await runWithFakes(["list", "--format", "json", "--plan-store-root", relativeRoot], { cwd: fixture.repoRoot, git: fixture.git });

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toEqual({
			success: true,
			plans: [
				{
					slug: "relative-root-plan-file",
					branch_key: fixture.branchKey,
					modified_time_ms: MODIFIED_TIME_MS,
					path: filePath,
					file_name: "relative-root-plan-file.md",
					repo: { root: fixture.repoRoot, key: fixture.repoKey, identity_source: "origin-url", plan_store_path: join(absoluteRoot, fixture.repoKey) },
				},
			],
		});
	});
});

describe("plans exec save pins", () => {
	test("pins missing slug usage errors, input exclusivity, and JSON failure bytes", async () => {
		const missingHuman = await runWithFakes(["exec", "save", "--stdin"]);
		expect(await missingHuman.exit).toBe(2);
		expect(missingHuman.stdout.join("")).toBe("");
		expect(missingHuman.stderr.join("")).toBe("error: --slug: Invalid input: expected string, received undefined\n");

		const missingJson = await runWithFakes(["exec", "save", "--stdin", "--format", "json"]);
		expect(await missingJson.exit).toBe(2);
		expect(missingJson.stdout.join("")).toBe("");
		expect(missingJson.stderr.join("")).toBe("error: --slug: Invalid input: expected string, received undefined\n");

		const both = await runWithFakes(["exec", "save", "--slug", "specific-branch-saved-plan", "--stdin", "--content-file", "plan.md"]);
		expect(await both.exit).toBe(2);
		expect(both.stderr.join("")).toBe("error: Pass exactly one of --stdin or --content-file <path>.\n");

		const neither = await runWithFakes(["exec", "save", "--slug", "specific-branch-saved-plan"]);
		expect(await neither.exit).toBe(2);
		expect(neither.stderr.join("")).toBe("error: Pass exactly one of --stdin or --content-file <path>.\n");

		const neitherJson = await runWithFakes(["exec", "save", "--slug", "specific-branch-saved-plan", "--format", "json"]);
		expect(await neitherJson.exit).toBe(2);
		expect(neitherJson.stdout.join("")).toBe(jsonFailure("Pass exactly one of --stdin or --content-file <path>."));
	});

	test.each([
		["specific-plan-name.md", "Pass the slug without the .md suffix."],
		["Not-Kebab-Case", "Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens."],
		["two-words", "Slug must contain at least 3 words."],
		["one-two-three-four-five-six-seven-eight", "Slug must contain at most 7 words."],
		["2026-06-10", "Slug must not be a date."],
		["specific-2026-plan", "Slug must not contain date-like year tokens."],
		["plan-task-work", "Slug must include at least one specific, non-generic word."],
	])("rejects invalid saved plan slug %s", async (slug, message) => {
		const run = await runWithFakes(["exec", "save", "--slug", slug, "--stdin", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(`Invalid saved plan slug: ${message}`));
	});

	test("accepts single-dash flag value before slug validation fails", async () => {
		const run = await runWithFakes(["exec", "save", "--slug", "-leading-dash", "--stdin", "--format", "json"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure("Invalid saved plan slug: Slug must be lowercase kebab-case using only a-z, 0-9, and single hyphens."));
		// PINNED QUIRK (clinkr-migration): parseFlagValue rejects --values but accepts single-dash values.
	});

	test("writes stdin content with exact JSON and human bytes", async () => {
		const fixture = await makeFixture();
		const slug = "specific-branch-saved-plan";
		const expectedPath = join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey, `${slug}.md`);
		const json = await runWithFakes(["exec", "save", "--slug", slug, "--summary", "Save it", "--stdin", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
			stdin: async () => "# Plan\n\nDo it.\n",
		});

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			`${JSON.stringify({
				success: true,
				slug,
				file_path: expectedPath,
				repo_root: fixture.repoRoot,
				repo_key: fixture.repoKey,
				repo_identity_source: "origin-url",
				source_branch: SOURCE_BRANCH,
				branch_key: fixture.branchKey,
				summary: "Save it",
			})}\n`,
		);
		expect(await readFile(expectedPath, "utf8")).toBe("# Plan\n\nDo it.\n");

		const noSummaryFixture = await makeFixture();
		const noSummary = await runWithFakes(["exec", "save", "--slug", "specific-branch-other-plan", "--stdin", "--format", "json"], {
			cwd: noSummaryFixture.repoRoot,
			git: noSummaryFixture.git,
			planStoreRoot: noSummaryFixture.planStoreRoot,
			stdin: async () => "# Plan\n",
		});
		expect(await noSummary.exit).toBe(0);
		expect(parseJson(noSummary)).not.toHaveProperty("summary");

		const humanFixture = await makeFixture();
		const humanPath = join(humanFixture.planStoreRoot, humanFixture.repoKey, humanFixture.branchKey, `${slug}.md`);
		const human = await runWithFakes(["exec", "save", "--slug", slug, "--summary", "Save it", "--stdin"], {
			cwd: humanFixture.repoRoot,
			git: humanFixture.git,
			planStoreRoot: humanFixture.planStoreRoot,
			stdin: async () => "# Plan\n",
		});
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toBe(
			[
				"Saved plan file in local plan store.",
				`Path: ${humanPath}`,
				`Repo key: ${humanFixture.repoKey}`,
				`Repo root: ${humanFixture.repoRoot}`,
				"Repo identity source: origin-url",
				`Source branch: ${SOURCE_BRANCH}`,
				`Branch path segment: ${humanFixture.branchKey}`,
				`Slug: ${slug}`,
				"Summary: Save it",
				"",
			].join("\n"),
		);
	});

	test("writes content-file input and reports missing files", async () => {
		const fixture = await makeFixture();
		const contentFile = join(await makeTempDir(), "input.md");
		await writeFile(contentFile, "# From file\n", "utf8");
		const run = await runWithFakes(["exec", "save", "--slug", "specific-file-saved-plan", "--content-file", contentFile, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
		});
		expect(await run.exit).toBe(0);
		expect(await readFile(String(parseJson(run).file_path), "utf8")).toBe("# From file\n");

		const missingHuman = await runWithFakes(["exec", "save", "--slug", "specific-file-saved-plan", "--content-file", join(fixture.repoRoot, "missing.md")], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
		});
		expect(await missingHuman.exit).toBe(2);
		expect(missingHuman.stderr.join("")).toContain("ENOENT");

		const missingJson = await runWithFakes(["exec", "save", "--slug", "specific-file-saved-plan", "--content-file", join(fixture.repoRoot, "missing.md"), "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
		});
		expect(await missingJson.exit).toBe(2);
		expect(parseJson(missingJson)).toMatchObject({ success: false, error: { code: "plans_error" } });
		expect(JSON.stringify(parseJson(missingJson))).toContain("ENOENT");
	});
});

describe("plans exec resolve pins", () => {
	test("pins parse and path validation failures", async () => {
		const fixture = await makeFixture();
		const twoPositionals = await runWithFakes(["exec", "resolve", "/tmp/one.md", "/tmp/two.md", "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await twoPositionals.exit).toBe(2);
		expect(twoPositionals.stdout.join("")).toBe("");
		expect(twoPositionals.stderr.join("")).toBe("error: too many arguments for 'resolve'. Expected 1 argument but got 2.\n");

		const unknown = await runWithFakes(["exec", "resolve", "--bogus"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await unknown.exit).toBe(2);
		expect(unknown.stderr.join("")).toBe("error: unknown option '--bogus'\n");

		const relativePath = await runWithFakes(["exec", "resolve", "relative-plan.md", "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await relativePath.exit).toBe(2);
		expect(relativePath.stdout.join("")).toBe(jsonFailure("Plan file path must be absolute or home-relative; got relative-plan.md."));

		const missing = await runWithFakes(["exec", "resolve", join(fixture.repoRoot, "missing.md"), "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await missing.exit).toBe(2);
		expect(missing.stdout.join("")).toBe(jsonFailure(`Plan file does not exist or is not accessible: ${join(fixture.repoRoot, "missing.md")}`));

		const directory = await runWithFakes(["exec", "resolve", fixture.repoRoot, "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await directory.exit).toBe(2);
		expect(directory.stdout.join("")).toBe(jsonFailure(`Plan file must be a regular file: ${fixture.repoRoot}`));

		const insidePath = join(fixture.repoRoot, "inside-plan.md");
		await writeFile(insidePath, "# Inside\n", "utf8");
		const inside = await runWithFakes(["exec", "resolve", insidePath, "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await inside.exit).toBe(2);
		expect(inside.stdout.join("")).toBe(jsonFailure(`Plan file must be outside the repository; got ${insidePath} inside ${fixture.repoRoot}.`));
	});

	test("resolves explicit absolute, @-prefixed, and home-relative paths", async () => {
		const fixture = await makeFixture();
		const outsideDir = await makeTempDir();
		const explicitPlan = join(outsideDir, "explicit.md");
		await writeFile(explicitPlan, "# Explicit\n", "utf8");
		const realExplicit = await realpath(explicitPlan);

		const explicitJson = await runWithFakes(["exec", "resolve", explicitPlan, "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await explicitJson.exit).toBe(0);
		expect(explicitJson.stdout.join("")).toBe(`${JSON.stringify({ success: true, source: "explicit", file_path: realExplicit })}\n`);

		const explicitHuman = await runWithFakes(["exec", "resolve", explicitPlan], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await explicitHuman.exit).toBe(0);
		expect(explicitHuman.stdout.join("")).toBe(`Resolved explicit plan file.\nPath: ${realExplicit}\n`);

		const atPath = await runWithFakes(["exec", "resolve", `@${explicitPlan}`, "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await atPath.exit).toBe(0);
		expect(parseJson(atPath)).toEqual({ success: true, source: "explicit", file_path: realExplicit });

		const homeDir = await makeHomeTempDir();
		const homePlan = join(homeDir, "home-relative.md");
		await writeFile(homePlan, "# Home\n", "utf8");
		const homeArg = `~/${relative(homedir(), homePlan)}`;
		const homePath = await runWithFakes(["exec", "resolve", homeArg, "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git });
		expect(await homePath.exit).toBe(0);
		expect(parseJson(homePath)).toEqual({ success: true, source: "explicit", file_path: await realpath(homePlan) });
	});

	test("resolves latest plan JSON and human output byte-exactly", async () => {
		const fixture = await makeFixture();
		await writePlanFile(fixture, "older-saved-plan-file.md", 1_000);
		const newer = await writePlanFile(fixture, "newer-saved-plan-file.md", 2_000);
		const json = await runWithFakes(["exec", "resolve", "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git, planStoreRoot: fixture.planStoreRoot });

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			`${JSON.stringify({
				success: true,
				source: "latest",
				file_path: newer,
				slug: "newer-saved-plan-file",
				file_name: "newer-saved-plan-file.md",
				modified_time_ms: 2_000,
				repo_root: fixture.repoRoot,
				repo_key: fixture.repoKey,
				repo_identity_source: "origin-url",
				source_branch: SOURCE_BRANCH,
				branch_key: fixture.branchKey,
				directory_path: join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey),
			})}\n`,
		);

		const human = await runWithFakes(["exec", "resolve"], { cwd: fixture.repoRoot, git: fixture.git, planStoreRoot: fixture.planStoreRoot });
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toBe(
			[
				"Resolved latest saved plan file in local plan store.",
				`Path: ${newer}`,
				`Repo key: ${fixture.repoKey}`,
				`Repo root: ${fixture.repoRoot}`,
				"Repo identity source: origin-url",
				`Source branch: ${SOURCE_BRANCH}`,
				`Branch path segment: ${fixture.branchKey}`,
				"Slug: newer-saved-plan-file",
				"Modified time ms: 2000",
				"",
			].join("\n"),
		);
	});

	test("empty latest store reports saved-plan-file guidance", async () => {
		const fixture = await makeFixture();
		const run = await runWithFakes(["exec", "resolve", "--format", "json"], { cwd: fixture.repoRoot, git: fixture.git, planStoreRoot: fixture.planStoreRoot });
		const directory = join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(
			jsonFailure(
				[
					"No local plan store directory exists for the current repository and branch.",
					`Plan store directory: ${directory}`,
					`Repo key: ${fixture.repoKey}`,
					`Source branch: ${SOURCE_BRANCH}`,
					`Branch path segment: ${fixture.branchKey}`,
					"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
				].join("\n"),
			),
		);
	});
});
