import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "../src/cli.ts";
import type { CommandResult, CommandRunner } from "../src/command-runner.ts";

type RunnerCall = {
	command: string;
	args: string[];
	cwd?: string | undefined;
};

type ResultFields = {
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	startupError?: string;
};

type ScriptStep = ResultFields & {
	command: string;
	args: string[];
};

class FakeRunner {
	readonly calls: RunnerCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptStep[];

	constructor(script: ScriptStep[]) {
		this.script = [...script];
	}

	readonly runner: CommandRunner = async (command, args, options = {}) => {
		this.calls.push({ command, args: [...args], cwd: options.cwd });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected command: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result(command, args, { exitCode: 99, stderr: message });
		}

		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return result(command, args, { exitCode: 99, stderr: message });
		}

		return result(command, args, expected);
	};

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

const tempDirs: string[] = [];

afterEach(() => {
	const dirs = tempDirs.splice(0);
	for (const dir of dirs) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function result(command: string, args: readonly string[], step: ResultFields): CommandResult {
	const commandResult: CommandResult = {
		command,
		args: [...args],
		exitCode: step.exitCode ?? 0,
		stdout: step.stdout ?? "",
		stderr: step.stderr ?? "",
	};
	if (step.startupError !== undefined) {
		commandResult.startupError = step.startupError;
	}
	return commandResult;
}

function step(command: string, args: string[], stdout = "", exitCode = 0, stderr = ""): ScriptStep {
	return { command, args, stdout, exitCode, stderr };
}

function resolverWith(commands: readonly string[]): (name: string) => string | undefined {
	const available = new Set(commands);
	return (name) => (available.has(name) ? name : undefined);
}

function runWithFake(args: readonly string[], fake: FakeRunner, options: { cwd?: string; env?: Record<string, string | undefined>; commands?: string[] } = {}) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		stdout,
		stderr,
		exit: runCli(args, {
			cwd: options.cwd ?? "/repo",
			env: options.env ?? {},
			runner: fake.runner,
			resolveCommand: resolverWith(options.commands ?? ["vercel"]),
			stdout: (text) => {
				stdout.push(text);
			},
			stderr: (text) => {
				stderr.push(text);
			},
		}),
	};
}

function readyDeploymentJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		deployments: [
			{
				url: "immutable.vercel.app",
				state: "READY",
				createdAt: 1780264074281,
				ready: 1780264085134,
				meta: {
					githubCommitRef: "feature/demo",
					githubPrId: "767",
					githubCommitSha: "abc123",
					branchAlias: "branch-alias.vercel.app",
				},
				...overrides,
			},
		],
	});
}

function inspectJson(): string {
	return JSON.stringify({
		id: "dpl_abc123",
		url: "immutable.vercel.app",
		aliases: ["branch-alias.vercel.app"],
	});
}

function emptyDeploymentsJson(): string {
	return JSON.stringify({ deployments: [] });
}

function gitBranchStep(branch: string): ScriptStep {
	return step("git", ["branch", "--show-current"], `${branch}\n`);
}

function gitRootStep(root = "/repo"): ScriptStep {
	return step("git", ["rev-parse", "--show-toplevel"], `${root}\n`);
}

function vercelListArgs(project: string, scope: string, metadataFilter: string): string[] {
	return [
		"ls",
		project,
		"--scope",
		scope,
		"--format=json",
		"--status",
		"READY",
		"--environment",
		"preview",
		"-m",
		metadataFilter,
		"--non-interactive",
	];
}

function vercelInspectArgs(scope: string): string[] {
	return ["inspect", "https://immutable.vercel.app", "--scope", scope, "--format=json", "--non-interactive"];
}

function assertNoGitHubOrGraphiteCalls(fake: FakeRunner): void {
	expect(fake.calls.some((call) => call.command === "gh" || call.command === "gt")).toBe(false);
}

describe("asdl-dev CLI", () => {
	test("top-level help lists latest-branch-deployment", async () => {
		const fake = new FakeRunner([]);
		const run = runWithFake(["--help"], fake);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("latest-branch-deployment");
		expect(run.stderr.join("")).toBe("");
		fake.assertDone();
	});

	test("command help documents options", async () => {
		const fake = new FakeRunner([]);
		const run = runWithFake(["latest-branch-deployment", "--help"], fake);

		expect(await run.exit).toBe(0);
		const help = run.stdout.join("");
		expect(help).toContain("--branch TEXT");
		expect(help).toContain("--project TEXT");
		expect(help).toContain("--scope TEXT");
		expect(help).toContain("--json");
		fake.assertDone();
	});

	test("happy path emits success JSON", async () => {
		const fake = new FakeRunner([
			gitBranchStep("feature/demo"),
			gitRootStep(),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "githubCommitRef=feature/demo"), readyDeploymentJson()),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "gitCommitRef=feature/demo"), emptyDeploymentsJson()),
			step("vercel", vercelInspectArgs("schrockns-projects"), inspectJson()),
		]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake);

		expect(await run.exit).toBe(0);
		const payload = JSON.parse(run.stdout.join("")) as Record<string, unknown>;
		expect(payload).toMatchObject({
			success: true,
			branch: "feature/demo",
			preview_url: "https://branch-alias.vercel.app",
			deployment_url: "https://immutable.vercel.app",
			dashboard_url: "https://vercel.com/schrockns-projects/asdl-tools/abc123",
			project: "asdl-tools",
			scope: "schrockns-projects",
			deployment: {
				id: "dpl_abc123",
				created_at_ms: 1780264074281,
				ready_at_ms: 1780264085134,
				commit_sha: "abc123",
				pr_number: 767,
			},
			evidence: { source: "vercel_cli_metadata", metadata_keys: ["githubCommitRef"] },
			warnings: [],
		});
		expect(run.stderr.join("")).toBe("");
		assertNoGitHubOrGraphiteCalls(fake);
		fake.assertDone();
	});

	test("--branch bypasses git current branch lookup", async () => {
		const fake = new FakeRunner([
			gitRootStep(),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "githubCommitRef=feature/demo"), readyDeploymentJson()),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "gitCommitRef=feature/demo"), emptyDeploymentsJson()),
			step("vercel", vercelInspectArgs("schrockns-projects"), inspectJson()),
		]);
		const run = runWithFake(["latest-branch-deployment", "--branch", "feature/demo", "--json"], fake);

		expect(await run.exit).toBe(0);
		expect(fake.calls[0]?.args).toEqual(["rev-parse", "--show-toplevel"]);
		expect(fake.calls.some((call) => sameArgs(call.args, ["branch", "--show-current"]))).toBe(false);
		fake.assertDone();
	});

	test("detached head returns structured error and exits 1", async () => {
		const fake = new FakeRunner([gitBranchStep("")]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake);

		expect(await run.exit).toBe(1);
		const payload = JSON.parse(run.stdout.join("")) as { success: false; error: { code: string } };
		expect(payload.success).toBe(false);
		expect(payload.error.code).toBe("detached_head");
		fake.assertDone();
	});

	test("no matching deployment returns structured error and exits 1", async () => {
		const fake = new FakeRunner([
			gitBranchStep("feature/demo"),
			gitRootStep(),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "githubCommitRef=feature/demo"), emptyDeploymentsJson()),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "gitCommitRef=feature/demo"), emptyDeploymentsJson()),
		]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake);

		expect(await run.exit).toBe(1);
		const payload = JSON.parse(run.stdout.join("")) as { success: false; error: { code: string } };
		expect(payload.error.code).toBe("no_matching_deployment");
		assertNoGitHubOrGraphiteCalls(fake);
		fake.assertDone();
	});

	test("missing Vercel command returns structured error and exits 2", async () => {
		const fake = new FakeRunner([gitBranchStep("feature/demo"), gitRootStep()]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake, { commands: [] });

		expect(await run.exit).toBe(2);
		const payload = JSON.parse(run.stdout.join("")) as { success: false; error: { code: string } };
		expect(payload.error.code).toBe("vercel_cli_unavailable");
		fake.assertDone();
	});

	test("Vercel command failure returns structured error and exits 2", async () => {
		const fake = new FakeRunner([
			gitBranchStep("feature/demo"),
			gitRootStep(),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "githubCommitRef=feature/demo"), "", 1, "auth failed"),
		]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake);

		expect(await run.exit).toBe(2);
		const payload = JSON.parse(run.stdout.join("")) as { success: false; error: { code: string; details?: Record<string, unknown> } };
		expect(payload.error.code).toBe("vercel_list_failed");
		expect(payload.error.details?.stderr).toBe("auth failed");
		fake.assertDone();
	});

	test("malformed Vercel JSON returns structured parse error and exits 2", async () => {
		const fake = new FakeRunner([
			gitBranchStep("feature/demo"),
			gitRootStep(),
			step("vercel", vercelListArgs("asdl-tools", "schrockns-projects", "githubCommitRef=feature/demo"), "not json"),
		]);
		const run = runWithFake(["latest-branch-deployment", "--json"], fake);

		expect(await run.exit).toBe(2);
		const payload = JSON.parse(run.stdout.join("")) as { success: false; error: { code: string } };
		expect(payload.error.code).toBe("vercel_json_parse_error");
		fake.assertDone();
	});

	test("reads projectName from .vercel/project.json", async () => {
		const root = mkdtempSync(join(tmpdir(), "asdl-dev-project-"));
		tempDirs.push(root);
		mkdirSync(join(root, ".vercel"));
		writeFileSync(join(root, ".vercel", "project.json"), JSON.stringify({ projectName: "custom-project" }), "utf8");
		const fake = new FakeRunner([
			gitRootStep(root),
			step("vercel", vercelListArgs("custom-project", "schrockns-projects", "githubCommitRef=feature/demo"), emptyDeploymentsJson()),
			step("vercel", vercelListArgs("custom-project", "schrockns-projects", "gitCommitRef=feature/demo"), emptyDeploymentsJson()),
		]);
		const run = runWithFake(["latest-branch-deployment", "--branch", "feature/demo", "--json"], fake);

		expect(await run.exit).toBe(1);
		fake.assertDone();
	});

	test("uses VERCEL_PROJECT and VERCEL_SCOPE overrides", async () => {
		const fake = new FakeRunner([
			gitRootStep(),
			step("vercel", vercelListArgs("env-project", "env-scope", "githubCommitRef=feature/demo"), emptyDeploymentsJson()),
			step("vercel", vercelListArgs("env-project", "env-scope", "gitCommitRef=feature/demo"), emptyDeploymentsJson()),
		]);
		const run = runWithFake(["latest-branch-deployment", "--branch", "feature/demo", "--json"], fake, {
			env: { VERCEL_PROJECT: "env-project", VERCEL_SCOPE: "env-scope" },
		});

		expect(await run.exit).toBe(1);
		fake.assertDone();
	});
});
