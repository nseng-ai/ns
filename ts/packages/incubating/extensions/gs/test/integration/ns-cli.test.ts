import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import {
	noopNsCommandIo,
	noopNsProgress,
	type ExecResult,
	type NsExecOptions,
} from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext } from "@nseng-ai/sdk/cli";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("ns gs list public route", () => {
	test.each([["-h"], ["--help"], ["--version"], ["--runtime"]])(
		"root %s does not inspect Git, run gh, or prompt",
		async (flag) => {
			const fixture = await createFixture();
			const run = runScenario([flag], fixture);
			expect(await run.exit).toBe(0);
			expect(run.context.execCalls).toEqual([]);
			expect(run.context.promptCalls).toBe(0);
		},
	);

	test("publishes local help and command options", async () => {
		const fixture = await createFixture();
		const group = runScenario(["gs", "--help"], fixture);
		expect(await group.exit).toBe(0);
		expect(group.stdout.join(" ")).toContain("Inspect and maintain local gh-stack state.");
		const list = runScenario(["gs", "list", "--help"], fixture);
		expect(await list.exit).toBe(0);
		expect(list.stdout.join(" ")).toContain("-v, --verbose");
		expect(fixture.context.execCalls).toEqual([]);
		const restack = runScenario(["gs", "restack-resolve", "--help"], fixture);
		expect(await restack.exit).toBe(0);
		expect(restack.stdout.join(" ")).toContain("--downstack");
		expect(restack.stdout.join(" ")).toContain("-y, --yes");
		expect(restack.stdout.join(" ")).not.toContain("--continue");
		const schema = runScenario(["gs", "restack-resolve", "--json-schema"], fixture);
		expect(await schema.exit).toBe(0);
		expect(JSON.parse(schema.stdout.join(""))).toHaveProperty("machineEnvelopeJsonSchema");
		expect(fixture.context.execCalls).toEqual([]);
	});

	test("runs one exact-v0.1.0 no-remote restack mutation with command overlays", async () => {
		const fixture = await createFixture({ restack: true });
		const run = runScenario(["gs", "restack-resolve", "--yes", "--format", "json"], fixture);
		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "success",
			data: { outcome: "completed", observedVersion: "0.1.0" },
		});
		const ghCalls = fixture.context.execCalls.filter((call) => call.command === "gh");
		expect(ghCalls.map((call) => call.args)).toEqual([
			["stack", "--version"],
			["stack", "rebase", "--no-trunk"],
		]);
		expect(ghCalls.every((call) => call.options?.env?.GH_PROMPT_DISABLED === "1")).toBe(true);
		expect(ghCalls.every((call) => call.options?.env?.GIT_SEQUENCE_EDITOR === "true")).toBe(true);
	});

	test("renders compact and verbose state and preserves exact JSON data", async () => {
		const fixture = await createFixture();
		const compact = runScenario(["gs", "list"], fixture);
		expect(await compact.exit).toBe(0);
		expect(compact.stdout.join("")).toBe(
			`Provider worktree: ${fixture.context.providerWorktreeGitDir}\n\nNUMBER  STACK         BASE\n8       bottom...top  main\n`,
		);
		const verbose = runScenario(["gs", "list", "-v"], fixture);
		expect(await verbose.exit).toBe(0);
		expect(verbose.stdout.join("")).toBe(
			`Provider worktree: ${fixture.context.providerWorktreeGitDir}\n\n8\n ├─ top\n ├─ bottom\n └─ main (base)\n`,
		);
		const json = runScenario(["gs", "list", "--format", "json"], fixture);
		expect(await json.exit).toBe(0);
		expect(JSON.parse(json.stdout.join(""))).toEqual({
			status: "success",
			exitCode: 0,
			data: {
				providerWorktreeGitDir: fixture.context.providerWorktreeGitDir,
				stacks: [
					{
						number: 8,
						base: "main",
						branches: [
							{ name: "bottom", pullRequest: { number: 30, recordedMerged: true } },
							{ name: "top", pullRequest: null },
						],
					},
				],
			},
		});
		expect(fixture.context.execCalls.every((call) => call.command === "git")).toBe(true);
		expect(fixture.context.promptCalls).toBe(0);
	});

	test("publishes schema and returns structured verbose JSON usage error", async () => {
		const fixture = await createFixture();
		const schema = runScenario(["gs", "list", "--json-schema"], fixture);
		expect(await schema.exit).toBe(0);
		expect(JSON.parse(schema.stdout.join(""))).toHaveProperty("machineEnvelopeJsonSchema");
		const conflict = runScenario(["gs", "list", "--verbose", "--format", "json"], fixture);
		expect(await conflict.exit).toBe(2);
		expect(JSON.parse(conflict.stdout.join(""))).toEqual({
			status: "usage-error",
			exitCode: 2,
			errorType: "usage-error",
			message: "--verbose cannot be combined with --format json.",
			data: { conflictingOptions: ["--verbose", "--format json"] },
		});
		expect(fixture.context.execCalls).toEqual([]);
	});

	test("renders empty state and a representative typed failure", async () => {
		const empty = await createFixture({ withoutState: true });
		const emptyRun = runScenario(["gs", "list", "--verbose"], empty);
		expect(await emptyRun.exit).toBe(0);
		expect(emptyRun.stdout.join("")).toBe(
			`Provider worktree: ${empty.context.providerWorktreeGitDir}\nNo current-worktree gh-stack stacks found.\n`,
		);

		const failure = await createFixture({ gitFailure: "not a repository" });
		const failureRun = runScenario(["gs", "list", "--format", "json"], failure);
		expect(await failureRun.exit).toBe(2);
		expect(JSON.parse(failureRun.stdout.join(""))).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "git-repository-unavailable",
			message: "Could not inspect the local Git repository.",
			data: { code: "git-repository-unavailable" },
		});
	});
});

interface Fixture {
	readonly cwd: string;
	readonly context: ScenarioContext;
}

async function createFixture(
	options: { state?: unknown; withoutState?: boolean; gitFailure?: string; restack?: boolean } = {},
): Promise<Fixture> {
	if (options.withoutState === true && "state" in options) {
		throw new Error("Fixture cannot define state when withoutState is true.");
	}
	const cwd = await mkdtemp(join(tmpdir(), "gs-ns-scenario-"));
	tempDirectories.push(cwd);
	const providerWorktreeGitDir = join(cwd, ".git-worktree");
	await mkdir(providerWorktreeGitDir);
	const state =
		options.withoutState === true
			? undefined
			: "state" in options
				? options.state
				: {
						schemaVersion: 1,
						stacks: [
							{
								number: 8,
								trunk: { branch: "main" },
								branches: [
									{ branch: "bottom", pullRequest: { number: 30, merged: true } },
									{ branch: "top" },
								],
							},
						],
					};
	if (state !== undefined) {
		await writeFile(join(providerWorktreeGitDir, "gh-stack"), JSON.stringify(state));
	}
	await writeFile(join(cwd, "ns.toml"), `extensions = [${JSON.stringify(packageRoot)}]\n`);
	return {
		cwd,
		context: new ScenarioContext(cwd, providerWorktreeGitDir, options.gitFailure, options.restack),
	};
}

function runScenario(args: readonly string[], fixture: Fixture) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		context: fixture.context,
		exit: runCli(args, {
			context: fixture.context,
			cwd: fixture.cwd,
			homeDir: fixture.cwd,
			env: fixture.context.env,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
			entryMetaUrl: new URL("../../../../../public/ns/src/cli.ts", import.meta.url).href,
		}),
	};
}

class ScenarioContext implements NsCliBaseContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: Array<{
		command: string;
		args: readonly string[];
		options?: NsExecOptions;
	}> = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly textGenerator = {
		async generateText(): Promise<never> {
			throw new Error("Unexpected text generation in gh-stack scenario.");
		},
	};
	promptCalls = 0;
	readonly providerWorktreeGitDir: string;
	private readonly gitFailure: string | undefined;
	private readonly restack: boolean;

	constructor(cwd: string, providerWorktreeGitDir: string, gitFailure?: string, restack = false) {
		this.cwd = cwd;
		this.providerWorktreeGitDir = providerWorktreeGitDir;
		this.gitFailure = gitFailure;
		this.restack = restack;
		this.env = { HOME: cwd };
	}

	readonly isInteractive = () => false;
	readonly confirm = (): never => {
		this.promptCalls += 1;
		throw new Error("Unexpected prompt in gh-stack scenario.");
	};
	readonly select = (): never => {
		this.promptCalls += 1;
		throw new Error("Unexpected prompt in gh-stack scenario.");
	};

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		this.execCalls.push({
			command,
			args: [...args],
			...(options === undefined ? {} : { options }),
		});
		if (this.restack) {
			if (command === "gh" && args.join(" ") === "stack --version") {
				return exited(0, "gh stack version 0.1.0\n", "");
			}
			if (command === "gh" && args.join(" ") === "stack rebase --no-trunk") {
				return exited(0, "", "");
			}
			if (command === "git" && args.join(" ") === "symbolic-ref --quiet --short HEAD") {
				return exited(0, "feature\n", "");
			}
			if (command === "git" && args.join(" ") === "status --porcelain=v1 -z") {
				return exited(0, "", "");
			}
		}
		if (command !== "git") {
			return exited(99, "", `unexpected command: ${command} ${args.join(" ")}`);
		}
		if (args.join(" ") === "rev-parse --path-format=absolute --git-path gh-stack") {
			if (this.gitFailure !== undefined) return exited(128, "", this.gitFailure);
			return exited(0, `${join(this.providerWorktreeGitDir, "gh-stack")}\n`, "");
		}
		if (sameArgs(args, GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS)) {
			return exited(
				0,
				"bottom\tabc123\t2026-08-22T00:00:00Z\ntop\tdef456\t2026-08-22T00:00:00Z\n",
				"",
			);
		}
		return exited(99, "", `unexpected command: ${command} ${args.join(" ")}`);
	}
}

function sameArgs(actual: readonly string[], expected: readonly string[]): boolean {
	return actual.length === expected.length && actual.every((arg, index) => arg === expected[index]);
}

function exited(code: number, stdout: string, stderr: string): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr };
}
