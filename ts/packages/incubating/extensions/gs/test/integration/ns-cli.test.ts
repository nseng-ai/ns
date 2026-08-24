import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS } from "@nseng-ai/foundation/git";
import { noopNsCommandIo, noopNsProgress, type ExecResult } from "@nseng-ai/sdk";
import { runCli, type NsCliBaseContext } from "@nseng-ai/sdk/cli";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const tempDirectories: string[] = [];

afterEach(async () => {
	for (const directory of tempDirectories.splice(0)) {
		await rm(directory, { recursive: true, force: true });
	}
});

describe("ns gs public routes", () => {
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
		expect(group.stdout.join(" ")).toContain("Inspect and maintain local gh-stack state.");
		const list = runScenario(["gs", "list", "--help"], fixture);
		expect(await list.exit).toBe(0);
		expect(list.stdout.join(" ")).toContain("-v, --verbose");
		const restack = runScenario(["gs", "restack-resolve", "--help"], fixture);
		expect(await restack.exit).toBe(0);
		expect(restack.stdout.join(" ")).toContain("--downstack");
		expect(restack.stdout.join(" ")).toContain("-n, --dry-run");
		expect(restack.stdout.join(" ")).toContain("-y, --yes");
		const schema = runScenario(["gs", "restack-resolve", "--json-schema"], fixture);
		expect(await schema.exit).toBe(0);
		expect(JSON.parse(schema.stdout.join(""))).toHaveProperty("machineEnvelopeJsonSchema");
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

	test("restack-resolve enforces authorization and dry-run does not mutate", async () => {
		const fixture = await createRestackFixture();
		const unauthorized = runScenario(["gs", "restack-resolve", "--format", "json"], fixture);
		expect(await unauthorized.exit).toBe(2);
		expect(JSON.parse(unauthorized.stdout.join(""))).toMatchObject({
			status: "usage-error",
			data: { requiredOption: "--yes", mode: "start", selectedBranches: ["b", "c"] },
		});
		expect(fixture.context.execCalls.some(isProviderMutation)).toBe(false);

		fixture.context.resetCalls();
		const dryRun = runScenario(["gs", "restack-resolve", "--dry-run", "--format", "json"], fixture);
		expect(await dryRun.exit).toBe(0);
		expect(JSON.parse(dryRun.stdout.join(""))).toMatchObject({
			status: "success",
			data: { outcome: "dry-run", selectedBranches: ["b", "c"] },
		});
		expect(fixture.context.execCalls.some(isProviderMutation)).toBe(false);
		expect(fixture.context.promptCalls).toBe(0);
	});

	test("restack-resolve uses exact full and downstack provider argv", async () => {
		for (const downstack of [false, true]) {
			const fixture = await createRestackFixture();
			const args = ["gs", "restack-resolve", "--yes", "--format", "json"];
			if (downstack) args.splice(2, 0, "--downstack");
			const run = runScenario(args, fixture);
			expect(await run.exit).toBe(0);
			expect(fixture.context.execCalls.filter(isProviderMutation)).toEqual([
				{
					command: "gh",
					args: downstack
						? ["stack", "rebase", "--no-trunk", "--downstack"]
						: ["stack", "rebase", "--no-trunk"],
				},
			]);
		}
	});

	test("restack-resolve continues ready rebases and returns unresolved or unstaged negatives", async () => {
		const ready = await createRestackFixture({ rebase: "ready" });
		const continued = runScenario(["gs", "restack-resolve", "--yes", "--format", "json"], ready);
		expect(await continued.exit).toBe(0);
		expect(JSON.parse(continued.stdout.join(""))).toMatchObject({
			status: "success",
			data: {
				outcome: "completed",
				selectedBranches: null,
				baseAnchor: null,
				postconditions: expect.arrayContaining([
					{ name: "fresh-provider-topology", passed: true },
					{ name: "provider-checkout-restored", passed: true },
					{ name: "provider-topology-settled", passed: true },
				]),
			},
		});
		expect(ready.context.execCalls.filter(isProviderMutation)).toEqual([
			{ command: "gh", args: ["stack", "rebase", "--continue"] },
		]);

		for (const rebase of ["unresolved", "unstaged"] as const) {
			const fixture = await createRestackFixture({ rebase });
			const run = runScenario(["gs", "restack-resolve", "--yes", "--format", "json"], fixture);
			expect(await run.exit).toBe(1);
			expect(JSON.parse(run.stdout.join(""))).toMatchObject({ status: "negative" });
			expect(fixture.context.execCalls.some(isProviderMutation)).toBe(false);
		}
	});

	test("restack-resolve stops after one new conflict", async () => {
		const fixture = await createRestackFixture({ rebase: "ready", conflictAfterMutation: true });
		const run = runScenario(["gs", "restack-resolve", "--yes", "--format", "json"], fixture);
		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "negative",
			data: { outcome: "conflict-stopped" },
		});
		expect(fixture.context.execCalls.filter(isProviderMutation)).toHaveLength(1);
	});

	test("restack-resolve distinguishes provider refusal from ambiguous changed state", async () => {
		const refused = await createRestackFixture({ providerFailure: true });
		const refusedRun = runScenario(["gs", "restack-resolve", "--yes", "--format", "json"], refused);
		expect(await refusedRun.exit).toBe(1);
		expect(JSON.parse(refusedRun.stdout.join(""))).toMatchObject({
			status: "negative",
			data: { outcome: "refused", diagnostic: { termination: "exit-1" } },
		});

		const ambiguous = await createRestackFixture({ providerFailure: true, refsChanged: true });
		const ambiguousRun = runScenario(
			["gs", "restack-resolve", "--yes", "--format", "json"],
			ambiguous,
		);
		expect(await ambiguousRun.exit).toBe(2);
		expect(JSON.parse(ambiguousRun.stdout.join(""))).toMatchObject({
			status: "failure",
			errorType: "restack-outcome-ambiguous",
			data: { outcome: "ambiguous" },
		});
	});

	test("renders empty state and a representative typed failure", async () => {
		const empty = await createFixture({ withoutState: true });
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

interface Fixture<TContext extends NsCliBaseContext = NsCliBaseContext> {
	readonly cwd: string;
	readonly context: TContext;
}

async function createFixture(
	options: { state?: unknown; withoutState?: boolean; gitFailure?: string } = {},
): Promise<Fixture<ScenarioContext>> {
	if (options.withoutState === true && "state" in options) {
		throw new Error("Fixture cannot define state when withoutState is true.");
	}
	const cwd = await mkdtemp(join(tmpdir(), "gs-ns-scenario-"));
	tempDirectories.push(cwd);
	const commonDir = join(cwd, ".git-common");
	await mkdir(commonDir);
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
	if (state !== undefined) await writeFile(join(commonDir, "gh-stack"), JSON.stringify(state));
	await writeFile(join(cwd, "ns.toml"), `extensions = [${JSON.stringify(packageRoot)}]\n`);
	return { cwd, context: new ScenarioContext(cwd, commonDir, options.gitFailure) };
}

async function createRestackFixture(
	options: RestackScenarioOptions = {},
): Promise<Fixture<RestackScenarioContext>> {
	const cwd = await mkdtemp(join(tmpdir(), "gs-restack-scenario-"));
	tempDirectories.push(cwd);
	await writeFile(join(cwd, "ns.toml"), `extensions = [${JSON.stringify(packageRoot)}]\n`);
	if (options.rebase !== undefined) {
		await mkdir(join(cwd, ".git", "rebase-merge"), { recursive: true });
	}
	return { cwd, context: new RestackScenarioContext(cwd, options) };
}

function runScenario<TContext extends NsCliBaseContext>(
	args: readonly string[],
	fixture: Fixture<TContext>,
) {
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
		if (command !== "git") {
			return exited(99, "", `unexpected command: ${command} ${args.join(" ")}`);
		}
		if (args.join(" ") === "rev-parse --git-common-dir") {
			if (this.gitFailure !== undefined) return exited(128, "", this.gitFailure);
			return exited(0, `${this.commonDir}\n`, "");
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

interface RestackScenarioOptions {
	readonly rebase?: "ready" | "unresolved" | "unstaged";
	readonly conflictAfterMutation?: boolean;
	readonly providerFailure?: boolean;
	readonly refsChanged?: boolean;
}

class RestackScenarioContext implements NsCliBaseContext {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly execCalls: Array<{ command: string; args: readonly string[] }> = [];
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly textGenerator = {
		async generateText(): Promise<never> {
			throw new Error("Unexpected text generation in restack scenario.");
		},
	};
	promptCalls = 0;
	private providerInvoked = false;
	private readonly options: RestackScenarioOptions;

	constructor(cwd: string, options: RestackScenarioOptions) {
		this.cwd = cwd;
		this.env = { HOME: cwd };
		this.options = options;
	}

	readonly isInteractive = () => false;
	readonly confirm = (): never => {
		this.promptCalls += 1;
		throw new Error("Unexpected prompt in restack scenario.");
	};
	readonly select = (): never => {
		this.promptCalls += 1;
		throw new Error("Unexpected prompt in restack scenario.");
	};

	resetCalls(): void {
		this.execCalls.splice(0);
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args] });
		const joined = args.join(" ");
		if (command === "gh" && joined === "stack --version")
			return exited(0, "gh stack version 0.1.0\n", "");
		if (command === "gh" && joined === "stack view --json")
			return exited(0, JSON.stringify(restackTopology()), "");
		if (command === "gh" && joined.startsWith("stack rebase ")) {
			this.providerInvoked = true;
			if (this.options.rebase === "ready" && !this.options.conflictAfterMutation) {
				await rm(join(this.cwd, ".git", "rebase-merge"), { recursive: true, force: true });
			}
			return this.options.providerFailure ? exited(1, "", "provider refused") : exited(0, "", "");
		}
		if (command !== "git") return exited(99, "", `unexpected command: ${command} ${joined}`);
		const stateChanged =
			this.providerInvoked && (!this.options.providerFailure || this.options.refsChanged === true);
		if (joined === "rev-parse HEAD") return exited(0, stateChanged ? "head2\n" : "head1\n", "");
		if (joined === "symbolic-ref --quiet --short HEAD")
			return this.options.rebase === undefined || stateChanged
				? exited(0, "b\n", "")
				: exited(1, "", "");
		if (joined === "status --porcelain=v1") {
			if (this.options.conflictAfterMutation && this.providerInvoked)
				return exited(0, "UU next.txt\n", "");
			if (stateChanged) return exited(0, "", "");
			if (this.options.rebase === "unresolved") return exited(0, "UU conflict.txt\n", "");
			if (this.options.rebase === "ready") return exited(0, "M  resolved.txt\n", "");
			if (this.options.rebase === "unstaged") return exited(0, " M resolved.txt\n", "");
			return exited(0, "", "");
		}
		if (joined === "worktree list --porcelain")
			return exited(0, `worktree ${this.cwd}\nHEAD head1\nbranch refs/heads/b\n\n`, "");
		if (joined.startsWith("rev-parse --verify refs/heads/")) {
			const branch = joined.slice("rev-parse --verify refs/heads/".length);
			const changed = stateChanged;
			return exited(0, `${branch}-${changed ? "2" : "1"}\n`, "");
		}
		if (joined.startsWith("merge-base --is-ancestor ")) return exited(0, "", "");
		return exited(99, "", `unexpected command: git ${joined}`);
	}
}

function restackTopology() {
	return {
		trunk: "main",
		currentBranch: "b",
		branches: [
			{ name: "a", base: "main", needsRebase: false, isCurrent: false },
			{ name: "b", base: "a", needsRebase: false, isCurrent: true },
			{ name: "c", base: "b", needsRebase: false, isCurrent: false },
		],
	};
}

function isProviderMutation(call: { command: string; args: readonly string[] }): boolean {
	return call.command === "gh" && call.args[0] === "stack" && call.args[1] === "rebase";
}

function sameArgs(actual: readonly string[], expected: readonly string[]): boolean {
	return actual.length === expected.length && actual.every((arg, index) => arg === expected[index]);
}

function exited(code: number, stdout: string, stderr: string): ExecResult {
	return { type: "exited", code, signal: null, stdout, stderr };
}
