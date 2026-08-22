import { describe, expect, test } from "vitest";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { CommandExecApi, ExecOptions } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { VERSION } from "../../src/cli.ts";
import { buildRepoPlanStoreKey, encodeBranchForPlanPath, runCli } from "../../src/index.ts";
import { InMemoryPlanStoreGateway } from "../../src/testing.ts";

const ORIGIN = "git@github.com:Owner/Repo.git";
const SOURCE_BRANCH = "feature/source-plan";
const MODIFIED_TIME_MS = 1_700_000_000_000;

const TOP_LEVEL_HELP = [
	"Usage: enriched-plan [options] [command]",
	"",
	"Enriched-plan operations. An enriched plan is any plan saved into ns.",
	"",
	"Options:",
	"  -V, --version      Show the package version.",
	"  --runtime          Show CLI runtime diagnostics and exit.",
	"  -h, --help         display help for command",
	"",
	"Commands:",
	"  list|ls [options]  List saved plans for the current repository across all",
	"                     branch keys.",
	"",
].join("\n");

const LIST_HELP = [
	"Usage: enriched-plan list|ls [options]",
	"",
	"List saved plans for the current repository across all branch keys.",
	"",
	"Options:",
	"  --plan-store-root <value>  Plan store root directory (relative paths resolve",
	"                             against cwd).",
	'  --format <format>          Output format. (choices: "human", "json",',
	'                             "markdown", "md", default: "human")',
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
	"  save [options]            Save Markdown bytes as a timestamped source-branch",
	"                            plan.",
	"  resolve [options] [path]  Resolve an explicit or latest source-branch plan",
	"                            file.",
	"",
].join("\n");
const SAVE_HELP = [
	"Usage: enriched-plan exec save [options]",
	"",
	"Save Markdown bytes as a timestamped source-branch plan.",
	"",
	"Options:",
	"  --slug <value>          Meaningful lowercase kebab-case slug derived from the",
	"                          plan content.",
	"  --content-file <value>  Markdown content file path (relative paths resolve",
	"                          against cwd).",
	'  --format <format>       Output format. (choices: "human", "json", "markdown",',
	'                          "md", default: "human")',
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
	'  --format <format>  Output format. (choices: "human", "json", "markdown", "md",',
	'                     default: "human")',
	"  --json-schema      Print the JSON Schema for this command's input/output and",
	"                     exit.",
	"  -h, --help         display help for command",
	"",
].join("\n");

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
	planStoreGateway: InMemoryPlanStoreGateway;
}

interface RunWithFakesOptions {
	cwd?: string;
	planStoreRoot?: string;
	git?: GitGateway;
	planStoreGateway?: InMemoryPlanStoreGateway;
	clock?: { nowMs(): number };
	localTimestamp?: string;
}

async function runWithFakes(
	args: readonly string[],
	options: RunWithFakesOptions = {},
): Promise<CliRun> {
	const cwd = options.cwd ?? makeTempDir();
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		exit: runCli(args, {
			cwd,
			git:
				options.git ??
				new InMemoryGitGateway({ repoRoot: cwd, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }),
			commands: unusedCommands,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			planStoreGateway: options.planStoreGateway ?? new InMemoryPlanStoreGateway(),
			...optionalEntry("planStoreRoot", options.planStoreRoot),
			...optionalEntry("clock", options.clock),
			...optionalEntry("localTimestamp", options.localTimestamp),
		}),
	};
}

async function makeFixture(): Promise<Fixture> {
	const repoRoot = makeTempDir();
	const planStoreRoot = makeTempDir();
	const repoKey = buildRepoPlanStoreKey(repoRoot, ORIGIN);
	const branchKey = encodeBranchForPlanPath(SOURCE_BRANCH);
	const planStoreGateway = new InMemoryPlanStoreGateway();
	planStoreGateway.mkdir(repoRoot);
	return {
		repoRoot,
		planStoreRoot,
		repoKey,
		branchKey,
		git: new InMemoryGitGateway({ repoRoot, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }),
		planStoreGateway,
	};
}

let tempDirCounter = 0;
function makeTempDir(prefix = "plans-cli-scenario-"): string {
	tempDirCounter += 1;
	return `/${prefix}${tempDirCounter}`;
}

function makeHomeTempDir(): string {
	return homedir();
}

async function writePlanFile(
	fixture: Fixture,
	fileName: string,
	modifiedTimeMs = MODIFIED_TIME_MS,
): Promise<string> {
	const directory = join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey);
	const filePath = join(directory, fileName);
	fixture.planStoreGateway.writeFile(filePath, `# ${fileName}\n`, { mtimeMs: modifiedTimeMs });
	return filePath;
}

function jsonFailure(message: string, errorType: string): string {
	return `${JSON.stringify(
		{ status: "failure", exitCode: 2, errorType, message, data: { code: "unexpected-error" } },
		null,
		2,
	)}\n`;
}

function jsonNegative(message: string, data?: Record<string, unknown>): string {
	return `${JSON.stringify(
		{ status: "negative", exitCode: 1, message, ...optionalEntry("data", data) },
		null,
		2,
	)}\n`;
}

function jsonSuccess(data: Record<string, unknown>): string {
	return `${JSON.stringify({ status: "ok", exitCode: 0, data }, null, 2)}\n`;
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
		expect(short.stdout.join("")).toBe(`${VERSION}\n`);

		const trailing = await runWithFakes(["--version", "extra-arg"]);
		expect(await trailing.exit).toBe(0);
		expect(trailing.stdout.join("")).toBe(`${VERSION}\n`);
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

	test("publishes typed list and save result schemas", async () => {
		for (const args of [
			["list", "--json-schema"],
			["exec", "save", "--json-schema"],
		]) {
			const run = await runWithFakes(args);
			expect(await run.exit).toBe(0);
			const schema = parseJson(run);
			expect(schema).toHaveProperty("outputJsonSchema");
			expect(JSON.stringify(schema.outputJsonSchema)).toContain('"format"');
			expect(run.stderr.join("")).toBe("");
		}
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
		expect(parseJson(unknownJson)).toMatchObject({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "error: unknown command 'bogus'",
		});
		expect(unknownJson.stderr.join("")).toBe("error: unknown command 'bogus'\n");
		// PINNED CLINKR SEMANTICS: unknown exec operations honor --format json.
	});
});

describe("plans list CLI pins", () => {
	test.each([
		[["list", "--bogus"], "error: unknown option '--bogus'\n"],
		[["list", "--format"], "error: option '--format <format>' argument missing\n"],
		[
			["list", "--format", "yaml"],
			"error: option '--format <format>' argument 'yaml' is invalid. Allowed choices are human, json, markdown, md.\n",
		],
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
		expect(run.stdout.join("")).toBe(jsonSuccess({ plans: [] }));
		expect(run.stderr.join("")).toBe("");
		// PINNED CLINKR SEMANTICS: commander accepts --flag=value syntax.
	});

	test("duplicate --format flags use commander last-wins validation", async () => {
		const run = await runWithFakes(["list", "--format", "json", "--format", "yaml"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe(
			"error: option '--format <format>' argument 'yaml' is invalid. Allowed choices are human, json, markdown, md.\n",
		);
		// PINNED CLINKR SEMANTICS: usage errors are raw stderr, never JSON-enveloped.
	});

	test("prints one-plan JSON and human list byte-exactly", async () => {
		const fixture = await makeFixture();
		const filePath = await writePlanFile(
			fixture,
			"first-useful-saved-plan--26-03-19T12-00-00--1.md",
		);
		const json = await runWithFakes(
			["list", "--format", "json", "--plan-store-root", fixture.planStoreRoot],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			jsonSuccess({
				plans: [
					{
						format: "timestamped",
						slug: "first-useful-saved-plan",
						branchKey: fixture.branchKey,
						modifiedTimeMs: MODIFIED_TIME_MS,
						path: filePath,
						fileName: "first-useful-saved-plan--26-03-19T12-00-00--1.md",
						repo: {
							root: fixture.repoRoot,
							key: fixture.repoKey,
							identitySource: "origin-url",
							planStorePath: join(fixture.planStoreRoot, fixture.repoKey),
						},
					},
				],
			}),
		);

		const human = await runWithFakes(["list", "--plan-store-root", fixture.planStoreRoot], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await human.exit).toBe(0);
		expect(human.stdout.join("")).toBe(
			[
				"Saved plans:",
				"- first-useful-saved-plan",
				"  Format: timestamped",
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
		const filePath = await writePlanFile(
			{ ...fixture, planStoreRoot: absoluteRoot },
			"relative-root-plan-file--26-03-19T12-00-00--1.md",
		);

		const run = await runWithFakes(
			["list", "--format", "json", "--plan-store-root", relativeRoot],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				plans: [
					{
						format: "timestamped",
						slug: "relative-root-plan-file",
						branchKey: fixture.branchKey,
						modifiedTimeMs: MODIFIED_TIME_MS,
						path: filePath,
						fileName: "relative-root-plan-file--26-03-19T12-00-00--1.md",
						repo: {
							root: fixture.repoRoot,
							key: fixture.repoKey,
							identitySource: "origin-url",
							planStorePath: join(absoluteRoot, fixture.repoKey),
						},
					},
				],
			},
		});
	});
});

describe("plans exec save", () => {
	test("publishes an outside regular content file byte-for-byte with a typed JSON result", async () => {
		const fixture = await makeFixture();
		const inputPath = join(makeTempDir(), "plan-input.md");
		const content = new Uint8Array([
			0xef, 0xbb, 0xbf, 0x23, 0x20, 0x53, 0x68, 0x69, 0x70, 0x20, 0x50, 0x6c, 0x61, 0x6e, 0x20,
			0x53, 0x74, 0x6f, 0x72, 0x65, 0x0d, 0x0a,
		]);
		fixture.planStoreGateway.writeBytes(inputPath, content);
		const run = await runWithFakes(
			[
				"exec",
				"save",
				"--slug",
				"ship-plan-store",
				"--content-file",
				inputPath,
				"--format",
				"json",
			],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
				localTimestamp: "26-01-02T03-04-05",
			},
		);
		expect(await run.exit).toBe(0);
		const envelope = parseJson(run);
		expect(envelope).toMatchObject({
			status: "ok",
			data: {
				format: "timestamped",
				slug: "ship-plan-store",
				fileName: "ship-plan-store--26-01-02T03-04-05--1.md",
				sequence: 1,
			},
		});
		const data = envelope.data;
		if (!isRecord(data) || typeof data.filePath !== "string") throw new Error("missing path");
		expect(fixture.planStoreGateway.readBytes(data.filePath)).toEqual(content);
	});

	test("rejects an invalid caller-provided slug", async () => {
		const fixture = await makeFixture();
		const inputPath = join(makeTempDir(), "plan-input.md");
		fixture.planStoreGateway.writeFile(inputPath, "# Valid content\n");
		const run = await runWithFakes(
			["exec", "save", "--slug", "generic-plan", "--content-file", inputPath, "--format", "json"],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
			},
		);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(
			jsonFailure(
				"Invalid saved plan slug: Slug must contain at least 3 words.",
				"saved-plan-write-failed",
			),
		);
	});

	test.each([
		["invalid UTF-8", new Uint8Array([0xff]), "Saved plan content must be valid UTF-8."],
		[
			"whitespace-only content",
			new TextEncoder().encode(" \t\r\n"),
			"Saved plan content must contain non-whitespace text.",
		],
	])("rejects %s", async (_name, content, message) => {
		const fixture = await makeFixture();
		const inputPath = join(makeTempDir(), "invalid-plan.md");
		fixture.planStoreGateway.writeBytes(inputPath, content);
		const run = await runWithFakes(
			[
				"exec",
				"save",
				"--slug",
				"invalid-content-plan",
				"--content-file",
				inputPath,
				"--format",
				"json",
			],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
				localTimestamp: "26-01-02T03-04-05",
			},
		);
		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe(jsonFailure(message, "saved-plan-write-failed"));
	});

	test("rejects missing and non-regular content paths", async () => {
		const fixture = await makeFixture();
		const outsideDirectory = makeTempDir();
		fixture.planStoreGateway.mkdir(outsideDirectory);
		for (const [contentPath, message] of [
			[join(makeTempDir(), "missing.md"), "Plan file does not exist or is not accessible"],
			[outsideDirectory, "Plan file must be a regular file"],
		] as const) {
			const run = await runWithFakes(
				[
					"exec",
					"save",
					"--slug",
					"outside-content-plan",
					"--content-file",
					contentPath,
					"--format",
					"json",
				],
				{
					cwd: fixture.repoRoot,
					git: fixture.git,
					planStoreRoot: fixture.planStoreRoot,
					planStoreGateway: fixture.planStoreGateway,
				},
			);
			expect(await run.exit).toBe(2);
			expect(parseJson(run)).toMatchObject({
				status: "failure",
				errorType: "saved-plan-write-failed",
				message: expect.stringContaining(message),
			});
		}
	});

	test("accepts repository-local content", async () => {
		const fixture = await makeFixture();
		const inputPath = join(fixture.repoRoot, "plan-input.md");
		fixture.planStoreGateway.writeFile(inputPath, "# Internal Saved Plan\n");
		const run = await runWithFakes(
			[
				"exec",
				"save",
				"--slug",
				"repository-content-plan",
				"--content-file",
				"plan-input.md",
				"--format",
				"json",
			],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
				localTimestamp: "26-01-02T03-04-05",
			},
		);

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			status: "ok",
			data: {
				slug: "repository-content-plan",
				fileName: "repository-content-plan--26-01-02T03-04-05--1.md",
			},
		});
	});
});

describe("plans exec resolve pins", () => {
	test("pins parse and path validation failures", async () => {
		const fixture = await makeFixture();
		const twoPositionals = await runWithFakes(
			["exec", "resolve", "/tmp/one.md", "/tmp/two.md", "--format", "json"],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);
		expect(await twoPositionals.exit).toBe(2);
		expect(parseJson(twoPositionals)).toMatchObject({
			status: "usageError",
			exitCode: 2,
			errorType: "usageError",
			message: "error: too many arguments for 'resolve'. Expected 1 argument but got 2.",
		});
		expect(twoPositionals.stderr.join("")).toBe(
			"error: too many arguments for 'resolve'. Expected 1 argument but got 2.\n",
		);

		const unknown = await runWithFakes(["exec", "resolve", "--bogus"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await unknown.exit).toBe(2);
		expect(unknown.stderr.join("")).toBe("error: unknown option '--bogus'\n");

		const relativePath = await runWithFakes(
			["exec", "resolve", "relative-plan.md", "--format", "json"],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);
		expect(await relativePath.exit).toBe(2);
		expect(relativePath.stdout.join("")).toBe(
			jsonFailure(
				"Plan file path must be absolute or home-relative; got relative-plan.md.",
				"saved-plan-resolution-failed",
			),
		);

		const missing = await runWithFakes(
			["exec", "resolve", join(fixture.repoRoot, "missing.md"), "--format", "json"],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);
		expect(await missing.exit).toBe(2);
		expect(missing.stdout.join("")).toBe(
			jsonFailure(
				`Plan file does not exist or is not accessible: ${join(fixture.repoRoot, "missing.md")}`,
				"saved-plan-resolution-failed",
			),
		);

		const directory = await runWithFakes(
			["exec", "resolve", fixture.repoRoot, "--format", "json"],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);
		expect(await directory.exit).toBe(2);
		expect(directory.stdout.join("")).toBe(
			jsonFailure(
				`Plan file must be a regular file: ${fixture.repoRoot}`,
				"saved-plan-resolution-failed",
			),
		);

		const insidePath = join(fixture.repoRoot, "inside-plan.md");
		fixture.planStoreGateway.writeFile(insidePath, "# Inside\n");
		const inside = await runWithFakes(["exec", "resolve", insidePath, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await inside.exit).toBe(2);
		expect(inside.stdout.join("")).toBe(
			jsonFailure(
				`Plan file must be outside the repository; got ${insidePath} inside ${fixture.repoRoot}.`,
				"saved-plan-resolution-failed",
			),
		);
	});

	test("resolves explicit absolute, @-prefixed, and home-relative paths", async () => {
		const fixture = await makeFixture();
		const outsideDir = makeTempDir();
		const explicitPlan = join(outsideDir, "explicit.md");
		fixture.planStoreGateway.writeFile(explicitPlan, "# Explicit\n");
		const realExplicit = explicitPlan;

		const explicitJson = await runWithFakes(["exec", "resolve", explicitPlan, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await explicitJson.exit).toBe(0);
		expect(explicitJson.stdout.join("")).toBe(
			jsonSuccess({ source: "explicit", filePath: realExplicit }),
		);

		const explicitHuman = await runWithFakes(["exec", "resolve", explicitPlan], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await explicitHuman.exit).toBe(0);
		expect(explicitHuman.stdout.join("")).toBe(
			`Resolved explicit plan file.\nPath: ${realExplicit}\n`,
		);

		const atPath = await runWithFakes(["exec", "resolve", `@${explicitPlan}`, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await atPath.exit).toBe(0);
		expect(parseJson(atPath)).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				source: "explicit",
				filePath: realExplicit,
			},
		});

		const homeDir = makeHomeTempDir();
		const homePlan = join(homeDir, "home-relative.md");
		fixture.planStoreGateway.writeFile(homePlan, "# Home\n");
		const homeArg = `~/${relative(homedir(), homePlan)}`;
		const homePath = await runWithFakes(["exec", "resolve", homeArg, "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreGateway: fixture.planStoreGateway,
		});
		expect(await homePath.exit).toBe(0);
		expect(parseJson(homePath)).toEqual({
			status: "ok",
			exitCode: 0,
			data: {
				source: "explicit",
				filePath: homePlan,
			},
		});
	});

	test("resolves latest plan JSON and human output byte-exactly", async () => {
		const fixture = await makeFixture();
		await writePlanFile(fixture, "older-saved-plan-file--26-03-18T12-00-00--1.md", 1_000);
		const newer = await writePlanFile(
			fixture,
			"newer-saved-plan-file--26-03-19T12-00-00--1.md",
			2_000,
		);
		const json = await runWithFakes(["exec", "resolve", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
		});

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			jsonSuccess({
				source: "latest",
				filePath: newer,
				slug: "newer-saved-plan-file",
				fileName: "newer-saved-plan-file--26-03-19T12-00-00--1.md",
				modifiedTimeMs: 2_000,
				repoRoot: fixture.repoRoot,
				repoKey: fixture.repoKey,
				repoIdentitySource: "origin-url",
				sourceBranch: SOURCE_BRANCH,
				branchKey: fixture.branchKey,
				directoryPath: join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey),
			}),
		);

		const human = await runWithFakes(["exec", "resolve"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
		});
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
		const run = await runWithFakes(["exec", "resolve", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
		});
		const directory = join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey);

		expect(await run.exit).toBe(1);
		expect(run.stdout.join("")).toBe(
			jsonNegative(
				[
					"No local plan store directory exists for the current repository and branch.",
					`Plan store directory: ${directory}`,
					`Repo key: ${fixture.repoKey}`,
					`Source branch: ${SOURCE_BRANCH}`,
					`Branch path segment: ${fixture.branchKey}`,
					"Create a saved plan first, or pass an explicit absolute or home-relative plan file path.",
				].join("\n"),
				{ code: "missing-directory", directoryPath: directory },
			),
		);
	});
});
