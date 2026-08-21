import { describe, expect, test } from "vitest";
import { homedir, tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

import type { CommandExecApi, ExecOptions } from "@nseng-ai/foundation/exec";
import type { GitGateway } from "@nseng-ai/foundation/git";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { VERSION } from "../../src/cli.ts";
import { buildRepoPlanStoreKey, encodeBranchForPlanPath, runCli } from "../../src/index.ts";
import { InMemoryPlanStoreGateway } from "../../src/testing.ts";
import type { WholePayloadReader } from "../../src/whole-payload-reader.ts";

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
	"  save [options]            Derive a semantic slug and save final Markdown in",
	"                            the local plan store.",
	"  resolve [options] [path]  Resolve an explicit or latest source-branch plan",
	"                            file.",
	"",
].join("\n");
const SAVE_HELP = [
	"Usage: enriched-plan exec save [options]",
	"",
	"Derive a semantic slug and save final Markdown in the local plan store.",
	"",
	"Options:",
	"  -i, --file <value>  Markdown source file. Omit to read stdin.",
	"  --summary <value>   Optional one-sentence plan summary.",
	'  --format <format>   Output format. (choices: "human", "json", "markdown",',
	'                      "md", default: "human")',
	"  --json-schema       Print the JSON Schema for this command's input/output and",
	"                      exit.",
	"  -h, --help          display help for command",
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
	env?: NodeJS.ProcessEnv;
	commands?: CommandExecApi;
	wholePayloadReader?: WholePayloadReader;
	planStoreRoot?: string;
	git?: GitGateway;
	planStoreGateway?: InMemoryPlanStoreGateway;
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
			...optionalEntry("env", options.env),
			git:
				options.git ??
				new InMemoryGitGateway({ repoRoot: cwd, originUrl: ORIGIN, currentBranch: SOURCE_BRANCH }),
			commands: options.commands ?? unusedCommands,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			planStoreGateway: options.planStoreGateway ?? new InMemoryPlanStoreGateway(),
			wholePayloadReader: options.wholePayloadReader ?? {
				async readFile() {
					throw new Error("Unexpected file payload read in test.");
				},
				async readStdin() {
					throw new Error("Unexpected stdin payload read in test.");
				},
			},
			...optionalEntry("planStoreRoot", options.planStoreRoot),
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
		const filePath = await writePlanFile(fixture, "first-useful-saved-plan.md");
		const json = await runWithFakes(
			["list", "--format", "json", "--plan-store-root", fixture.planStoreRoot],
			{ cwd: fixture.repoRoot, git: fixture.git, planStoreGateway: fixture.planStoreGateway },
		);

		expect(await json.exit).toBe(0);
		expect(json.stdout.join("")).toBe(
			jsonSuccess({
				plans: [
					{
						slug: "first-useful-saved-plan",
						branchKey: fixture.branchKey,
						modifiedTimeMs: MODIFIED_TIME_MS,
						path: filePath,
						fileName: "first-useful-saved-plan.md",
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
			"relative-root-plan-file.md",
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
						slug: "relative-root-plan-file",
						branchKey: fixture.branchKey,
						modifiedTimeMs: MODIFIED_TIME_MS,
						path: filePath,
						fileName: "relative-root-plan-file.md",
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
	test("reads a file payload, derives its slug, writes exclusively, and returns typed evidence", async () => {
		const fixture = await makeFixture();
		const modelRoot = mkdtempSync(join(tmpdir(), "plans-cli-save-model-"));
		writeFileSync(
			join(modelRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
		const content = "# Portable Saved Plan\n\nPersist this reviewed plan.\n";
		const sourceReads: string[] = [];
		const commands: CommandExecApi = {
			async exec(command, args) {
				if (command === "git" && args[0] === "rev-parse") {
					return { type: "exited", stdout: `${modelRoot}\n`, stderr: "", code: 0, signal: null };
				}
				if (command === "pi") {
					return {
						type: "exited",
						stdout: "portable-saved-plan-flow\n",
						stderr: "",
						code: 0,
						signal: null,
					};
				}
				throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
			},
		};
		const run = await runWithFakes(
			[
				"exec",
				"save",
				"--file",
				"/tmp/final-plan.md",
				"--summary",
				"Portable plan.",
				"--format",
				"json",
			],
			{
				cwd: fixture.repoRoot,
				git: fixture.git,
				commands,
				planStoreRoot: fixture.planStoreRoot,
				planStoreGateway: fixture.planStoreGateway,
				wholePayloadReader: {
					async readFile(path) {
						sourceReads.push(path);
						return content;
					},
					async readStdin() {
						throw new Error("Unexpected stdin read.");
					},
				},
			},
		);

		expect(await run.exit).toBe(0);
		expect(sourceReads).toEqual(["/tmp/final-plan.md"]);
		const result = parseJson(run);
		expect(result).toMatchObject({
			status: "ok",
			exitCode: 0,
			data: {
				slug: "portable-saved-plan-flow",
				repoRoot: fixture.repoRoot,
				repoKey: fixture.repoKey,
				repoIdentitySource: "origin-url",
				sourceBranch: SOURCE_BRANCH,
				branchKey: fixture.branchKey,
				summary: "Portable plan.",
				provider: "openai-codex",
				model: "gpt-5.6-luna",
			},
		});
		const data = result.data;
		if (!isRecord(data) || typeof data.filePath !== "string") {
			throw new Error("Expected saved file evidence.");
		}
		expect(fixture.planStoreGateway.readFile(data.filePath)).toBe(content);
	});

	test("uses the injected XDG state root when no plan-store override is supplied", async () => {
		const fixture = await makeFixture();
		const modelRoot = mkdtempSync(join(tmpdir(), "plans-cli-xdg-model-"));
		writeFileSync(
			join(modelRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
		const commands: CommandExecApi = {
			async exec(command) {
				return command === "git"
					? { type: "exited", stdout: `${modelRoot}\n`, stderr: "", code: 0, signal: null }
					: {
							type: "exited",
							stdout: "xdg-saved-plan-location\n",
							stderr: "",
							code: 0,
							signal: null,
						};
			},
		};
		const run = await runWithFakes(["exec", "save", "--format", "json"], {
			cwd: fixture.repoRoot,
			env: { HOME: "/home/tester", XDG_STATE_HOME: "/custom-state" },
			git: fixture.git,
			commands,
			planStoreGateway: fixture.planStoreGateway,
			wholePayloadReader: {
				async readFile() {
					throw new Error("Unexpected file read.");
				},
				async readStdin() {
					return "# XDG Plan\n";
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(parseJson(run)).toMatchObject({
			status: "ok",
			data: {
				filePath: join(
					"/custom-state/ns/enriched-plan",
					fixture.repoKey,
					fixture.branchKey,
					"xdg-saved-plan-location.md",
				),
			},
		});
	});

	test("reads stdin, honors the configured slug operation, and renders human evidence", async () => {
		const fixture = await makeFixture();
		const modelRoot = mkdtempSync(join(tmpdir(), "plans-cli-configured-model-"));
		writeFileSync(
			join(modelRoot, "ns.toml"),
			[
				"[models.profiles.fast]",
				'model = "fallback/fast"',
				'thinking = "minimal"',
				"[models.profiles.slugger]",
				'model = "configured/slug-model"',
				'thinking = "low"',
				"[models.operations]",
				'slug = "slugger"',
				"",
			].join("\n"),
		);
		const piArgs: string[][] = [];
		const commands: CommandExecApi = {
			async exec(command, args) {
				if (command === "git") {
					return { type: "exited", stdout: `${modelRoot}\n`, stderr: "", code: 0, signal: null };
				}
				piArgs.push([...args]);
				return {
					type: "exited",
					stdout: "configured-saved-plan-slug\n",
					stderr: "",
					code: 0,
					signal: null,
				};
			},
		};
		const content = "# Configured Plan\n";
		const run = await runWithFakes(["exec", "save"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
			wholePayloadReader: {
				async readFile() {
					throw new Error("Unexpected file read.");
				},
				async readStdin() {
					return content;
				},
			},
		});

		expect(await run.exit).toBe(0);
		expect(piArgs[0]).toEqual(
			expect.arrayContaining(["--provider", "configured", "--model", "slug-model"]),
		);
		const output = run.stdout.join("");
		expect(output).toContain("Saved plan file in local plan store.");
		expect(output).toContain("Slug: configured-saved-plan-slug");
		expect(output).toContain("Slug model: configured/slug-model");
		expect(run.stderr.join("")).toBe("");
	});

	test("publishes the save request and result schema", async () => {
		const run = await runWithFakes(["exec", "save", "--json-schema"]);

		expect(await run.exit).toBe(0);
		const schema = parseJson(run);
		expect(JSON.stringify(schema)).toContain('"file"');
		expect(JSON.stringify(schema)).toContain('"provider"');
		expect(JSON.stringify(schema)).toContain('"model"');
		expect(run.stderr.join("")).toBe("");
	});

	test("fails without fallback on invalid model output and writes nothing", async () => {
		const fixture = await makeFixture();
		const modelRoot = mkdtempSync(join(tmpdir(), "plans-cli-invalid-model-"));
		writeFileSync(
			join(modelRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
		const commands: CommandExecApi = {
			async exec(command) {
				return command === "git"
					? { type: "exited", stdout: `${modelRoot}\n`, stderr: "", code: 0, signal: null }
					: { type: "exited", stdout: "work plan task\n", stderr: "", code: 0, signal: null };
			},
		};
		const run = await runWithFakes(["exec", "save", "--format", "json"], {
			cwd: fixture.repoRoot,
			git: fixture.git,
			commands,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
			wholePayloadReader: {
				async readFile() {
					return "";
				},
				async readStdin() {
					return "# Plan\n";
				},
			},
		});

		expect(await run.exit).toBe(2);
		expect(parseJson(run)).toMatchObject({
			status: "failure",
			errorType: "saved-plan-save-failed",
		});
		expect(run.stdout.join("")).toContain(
			"No assistant-generated slug or deterministic fallback was attempted.",
		);
		expect(
			await fixture.planStoreGateway.listDirectory(
				join(fixture.planStoreRoot, fixture.repoKey, fixture.branchKey),
			),
		).toEqual({ type: "missing" });
	});

	test("rejects detached HEAD and exclusive collisions", async () => {
		const fixture = await makeFixture();
		const modelRoot = mkdtempSync(join(tmpdir(), "plans-cli-collision-model-"));
		writeFileSync(
			join(modelRoot, "ns.toml"),
			'[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
		);
		const commands: CommandExecApi = {
			async exec(command) {
				return command === "git"
					? { type: "exited", stdout: `${modelRoot}\n`, stderr: "", code: 0, signal: null }
					: {
							type: "exited",
							stdout: "exclusive-saved-plan-collision\n",
							stderr: "",
							code: 0,
							signal: null,
						};
			},
		};
		const options = {
			cwd: fixture.repoRoot,
			commands,
			planStoreRoot: fixture.planStoreRoot,
			planStoreGateway: fixture.planStoreGateway,
			wholePayloadReader: {
				async readFile() {
					return "";
				},
				async readStdin() {
					return "# Plan\n";
				},
			},
		};
		const detached = await runWithFakes(["exec", "save", "--format", "json"], {
			...options,
			git: new InMemoryGitGateway({
				repoRoot: fixture.repoRoot,
				originUrl: ORIGIN,
				currentBranch: { type: "detached" },
			}),
		});
		expect(await detached.exit).toBe(2);
		expect(detached.stdout.join("")).toContain("detached or unnamed");

		const first = await runWithFakes(["exec", "save", "--format", "json"], {
			...options,
			git: fixture.git,
		});
		expect(await first.exit).toBe(0);
		const collision = await runWithFakes(["exec", "save", "--format", "json"], {
			...options,
			git: fixture.git,
		});
		expect(await collision.exit).toBe(2);
		expect(collision.stdout.join("")).toContain("already exists");
		expect(collision.stdout.join("")).toContain("refusing to overwrite");
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
		await writePlanFile(fixture, "older-saved-plan-file.md", 1_000);
		const newer = await writePlanFile(fixture, "newer-saved-plan-file.md", 2_000);
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
				fileName: "newer-saved-plan-file.md",
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
