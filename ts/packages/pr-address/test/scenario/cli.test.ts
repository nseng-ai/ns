import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { runCli } from "../../src/cli.ts";
import { RealLegacyPrAddressGateway, type ProcessRunRequest } from "../../src/legacy-python.ts";
import { InMemoryLegacyPrAddressGateway } from "../support/in-memory-legacy-pr-address-gateway.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../../../", import.meta.url)));

interface CliRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	legacy: InMemoryLegacyPrAddressGateway;
}

function runWithFakeLegacy(args: readonly string[], exitCodes: readonly number[] = [0]): CliRun {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const legacy = new InMemoryLegacyPrAddressGateway(exitCodes);
	return {
		exit: runCli(args, {
			context: { legacy },
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
		legacy,
	};
}

describe("pr-address CLI scaffold", () => {
	test("prints top-level help and version", async () => {
		const help = runWithFakeLegacy(["--help"]);
		expect(await help.exit).toBe(0);
		expect(help.stdout.join("")).toContain("Usage: pr-address");
		expect(help.stdout.join("")).not.toContain("exec");
		expect(help.legacy.calls).toEqual([]);

		const version = runWithFakeLegacy(["--version"]);
		expect(await version.exit).toBe(0);
		expect(version.stdout.join("")).toBe("0.1.0\n");
		expect(version.legacy.calls).toEqual([]);
	});

	test("rejects unknown top-level commands", async () => {
		const run = runWithFakeLegacy(["bogus"]);

		expect(await run.exit).toBe(2);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toContain("Unknown command: bogus");
		expect(run.stderr.join("")).toContain("Usage: pr-address");
		expect(run.legacy.calls).toEqual([]);
	});

	test("prints exec help for hidden agent operations", async () => {
		const run = runWithFakeLegacy(["exec", "--help"]);

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Usage: pr-address exec");
		expect(run.stdout.join("")).toContain("delegates directly to the legacy Python");
		expect(run.stdout.join("")).toContain("prepare-run");
		expect(run.stdout.join("")).toContain("build-stack-resolve-thread-payloads");
		expect(run.legacy.calls).toEqual([]);
	});

	test("delegates exact exec args to the legacy gateway", async () => {
		const run = runWithFakeLegacy(["exec", "prepare-run", "--payload-session-id", "abc", "--format", "json"], [7]);

		expect(await run.exit).toBe(7);
		expect(run.stdout.join("")).toBe("");
		expect(run.stderr.join("")).toBe("");
		expect(run.legacy.calls).toEqual([
			{
				args: ["exec", "prepare-run", "--payload-session-id", "abc", "--format", "json"],
				options: { cwd: "/repo", env: { PATH: "/fake/bin" } },
			},
		]);
	});

	test("preserves arbitrary operation argv shape for stdin-oriented commands", async () => {
		const run = runWithFakeLegacy(["exec", "validate-feedback-classification", "--format", "json"], [0]);

		expect(await run.exit).toBe(0);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "validate-feedback-classification", "--format", "json"]]);
	});

	test("preserves nonzero legacy exit codes", async () => {
		const run = runWithFakeLegacy(["exec", "resolve-thread", "PRRT_123"], [2]);

		expect(await run.exit).toBe(2);
		expect(run.legacy.calls.map((call) => call.args)).toEqual([["exec", "resolve-thread", "PRRT_123"]]);
	});
});

describe("legacy Python fallback routing", () => {
	test("uses local uv project command when a legacy checkout marker is present", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 0;
			},
		});

		const exit = await gateway.run(["exec", "prepare-run"], { cwd: REPO_ROOT, env: { PATH: "/fake/bin" } });

		expect(exit).toBe(0);
		expect(requests).toEqual([
			{
				command: "uv",
				args: ["run", "--project", REPO_ROOT, "pr-address", "exec", "prepare-run"],
				cwd: REPO_ROOT,
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});

	test("uses pinned uvx fallback outside a legacy checkout", async () => {
		const requests: ProcessRunRequest[] = [];
		const gateway = new RealLegacyPrAddressGateway({
			runProcess: async (request) => {
				requests.push(request);
				return 3;
			},
		});

		const exit = await gateway.run(["exec", "prepare-run"], { cwd: "/", env: { PATH: "/fake/bin" } });

		expect(exit).toBe(3);
		expect(requests).toEqual([
			{
				command: "uvx",
				args: ["--from", "asdl-pr-address==0.1.0", "pr-address", "exec", "prepare-run"],
				cwd: "/",
				env: { PATH: "/fake/bin" },
				stdio: "inherit",
			},
		]);
	});
});
