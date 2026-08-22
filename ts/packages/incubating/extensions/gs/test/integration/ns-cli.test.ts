import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress, type ExecResult } from "@nseng-ai/sdk";
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

	test("publishes local-only help and verbose option", async () => {
		const fixture = await createFixture();
		const group = runScenario(["gs", "--help"], fixture);
		expect(await group.exit).toBe(0);
		expect(group.stdout.join(" ")).toContain("Inspect local-only gh-stack state.");
		const list = runScenario(["gs", "list", "--help"], fixture);
		expect(await list.exit).toBe(0);
		expect(list.stdout.join(" ")).toContain("-v, --verbose");
		expect(fixture.context.execCalls).toEqual([]);
	});

	test("renders compact and verbose state and preserves exact JSON data", async () => {
		const fixture = await createFixture();
		const compact = runScenario(["gs", "list"], fixture);
		expect(await compact.exit).toBe(0);
		expect(compact.stdout.join("")).toBe(
			"NUMBER  STACK         BASE\n8       bottom...top  main\n",
		);
		const verbose = runScenario(["gs", "list", "-v"], fixture);
		expect(await verbose.exit).toBe(0);
		expect(verbose.stdout.join("")).toBe("8\n ├─ top\n ├─ bottom\n └─ main (base)\n");
		const json = runScenario(["gs", "list", "--format", "json"], fixture);
		expect(await json.exit).toBe(0);
		expect(JSON.parse(json.stdout.join(""))).toEqual({
			status: "success",
			exitCode: 0,
			data: {
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
		const empty = await createFixture({ state: undefined });
		const emptyRun = runScenario(["gs", "list", "--verbose"], empty);
		expect(await emptyRun.exit).toBe(0);
		expect(emptyRun.stdout.join("")).toBe("No local gh-stack stacks found.\n");

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
	options: { state?: unknown; gitFailure?: string } = {},
): Promise<Fixture> {
	const cwd = await mkdtemp(join(tmpdir(), "gh-stack-ns-scenario-"));
	tempDirectories.push(cwd);
	const commonDir = join(cwd, ".git-common");
	await mkdir(commonDir);
	const state =
		"state" in options
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
	if (state !== undefined) await writeFile(join(commonDir, "gh-stack"), JSON.stringify(state));
	await writeFile(join(cwd, "ns.toml"), `extensions = [${JSON.stringify(packageRoot)}]\n`);
	return { cwd, context: new ScenarioContext(cwd, commonDir, options.gitFailure) };
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
	readonly execCalls: Array<{ command: string; args: readonly string[] }> = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly textGenerator = {
		async generateText(): Promise<never> {
			throw new Error("Unexpected text generation in gh-stack scenario.");
		},
	};
	promptCalls = 0;
	private readonly commonDir: string;
	private readonly gitFailure: string | undefined;

	constructor(cwd: string, commonDir: string, gitFailure?: string) {
		this.cwd = cwd;
		this.commonDir = commonDir;
		this.gitFailure = gitFailure;
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

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args] });
		if (command !== "git" || args.join(" ") !== "rev-parse --git-common-dir") {
			return exited(99, "", `unexpected command: ${command} ${args.join(" ")}`);
		}
		if (this.gitFailure !== undefined) return exited(128, "", this.gitFailure);
		return exited(0, `${this.commonDir}\n`, "");
	}
}

function exited(code: number, stdout: string, stderr: string): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr };
}
