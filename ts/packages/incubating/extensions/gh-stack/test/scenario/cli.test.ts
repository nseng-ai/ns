import { resolve } from "node:path";

import { runCli } from "@nseng-ai/sdk/cli";
import { noopNsCommandIo, noopNsProgress, type NsExtensionApi } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";

import type { GhStackListContext } from "../../src/core/gateways/contracts.ts";

const checkoutRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..", "..", "..");

interface RunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly api: ScenarioApi;
}

class ScenarioApi implements NsExtensionApi {
	readonly cwd = checkoutRoot;
	readonly env = { HOME: resolve(checkoutRoot, ".gh-stack-scenario-home") };
	readonly extensions: Readonly<Record<string, unknown>>;
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly textGenerator = {
		generateText: async () => ({ ok: false as const, error: "unexpected text generation" }),
	};
	readonly calls: string[] = [];
	readonly promptCalls: string[] = [];

	constructor(listContext: GhStackListContext) {
		this.extensions = { ghStack: { listContext } };
	}

	async exec(command: string, args: string[]) {
		this.calls.push([command, ...args].join(" "));
		return { type: "exited" as const, code: 99, signal: null, stdout: "", stderr: "unexpected" };
	}

	isInteractive(): boolean {
		return false;
	}

	confirm(): never {
		this.promptCalls.push("confirm");
		throw new Error("gs list must not prompt");
	}

	select(): never {
		this.promptCalls.push("select");
		throw new Error("gs list must not prompt");
	}
}

function listContext(
	options: { empty?: boolean; remoteFailure?: boolean } = {},
): GhStackListContext {
	return {
		installation: {
			async verifyInstallation() {
				return { ok: true, version: "0.1.0" };
			},
		},
		local: {
			async loadLocalStacks() {
				return {
					ok: true,
					value: options.empty
						? []
						: [
								{
									id: "matched",
									number: 41,
									base: "main",
									branches: [
										{ name: "matched-bottom", pullRequest: { number: 401, merged: false } },
										{ name: "matched-top", pullRequest: null },
									],
								},
								{
									id: null,
									number: null,
									base: "main",
									branches: [{ name: "unpublished", pullRequest: null }],
								},
							],
				};
			},
		},
		remote: {
			async loadRemoteStacks() {
				if (options.remoteFailure) {
					return {
						ok: false,
						error: {
							type: "github-stack-discovery-failed",
							evidence: { command: "gh api", summary: "offline" },
						},
					};
				}
				return {
					ok: true,
					value: options.empty
						? []
						: [
								{
									id: "remote",
									number: 42,
									base: "main",
									createdAt: "2026-01-02T03:04:05.000Z",
									pullRequests: [
										{ number: 402, state: "open", mergedAt: null, branch: "remote-bottom" },
									],
								},
								{
									id: "matched",
									number: 41,
									base: "main",
									createdAt: "2026-01-01T03:04:05.000Z",
									pullRequests: [
										{ number: 401, state: "open", mergedAt: null, branch: "matched-bottom" },
									],
								},
							],
				};
			},
		},
	};
}

async function run(args: readonly string[], context = listContext()): Promise<RunResult> {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const api = new ScenarioApi(context);
	const exitCode = await runCli(args, {
		context: api,
		cwd: checkoutRoot,
		homeDir: api.env.HOME,
		env: api.env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
	});
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join(""), api };
}

describe("ns gs list scenario", () => {
	test.each([["-h"], ["--help"]])(
		"discovers the descriptor route and help with %s",
		async (flag) => {
			const result = await run(["gs", "list", flag]);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("Usage: sdk gs list");
			expect(result.stdout).toContain("-L, --limit");
		},
	);

	test.each(["--version", "--runtime"])("supports inherited root metadata %s", async (arg) => {
		const result = await run([arg]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout.length).toBeGreaterThan(0);
	});

	test("renders deterministic mixed inventory with matched stacks labeled Local", async () => {
		const result = await run(["gs", "list"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("NUMBER");
		expect(result.stdout.indexOf("unpublished")).toBeLessThan(
			result.stdout.indexOf("remote-bottom"),
		);
		expect(result.stdout).toContain("matched-bottom...matched-top");
		expect(result.stdout).toContain("Local");
		expect(result.api.promptCalls).toEqual([]);
		expect(result.api.calls).toEqual([]);
	});

	test("returns canonical JSON with complete branch arrays and custom bound", async () => {
		const result = await run(["gs", "list", "-L", "2", "--format", "json"]);
		expect(result.exitCode).toBe(0);
		const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
		expect(envelope).toMatchObject({
			status: "success",
			exitCode: 0,
			data: { limit: 2, returned: 2, total: 3, truncated: true },
		});
		expect(envelope).toHaveProperty("data.stacks.1.branches", ["remote-bottom"]);
	});

	test("publishes the real envelope schema", async () => {
		const result = await run(["gs", "list", "--json-schema"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('"stacks"');
		expect(result.stdout).toContain('"bottomBranch"');
		expect(result.stdout).toContain('"status"');
	});

	test("renders exact empty success", async () => {
		const result = await run(["gs", "list"], listContext({ empty: true }));
		expect(result).toMatchObject({ exitCode: 0, stdout: "No active stacks found.\n", stderr: "" });
	});

	test("reports truncation recovery", async () => {
		const truncated = await run(["gs", "list", "--limit", "1"]);
		expect(truncated.stdout).toContain("Showing 1 of 3 stacks");
		expect(truncated.stdout).toContain("ns gs list --limit 3");
	});

	test.each(["0", "-1", "1.5", "many", "1001"])(
		"returns structured usage data for invalid limit %s",
		async (limit) => {
			const invalid = await run(["gs", "list", "--limit", limit, "--format", "json"]);
			expect(invalid.exitCode).toBe(2);
			expect(JSON.parse(invalid.stdout)).toMatchObject({
				status: "usage-error",
				exitCode: 2,
				data: { argument: "--limit", value: limit, minimum: 1, maximum: 1000 },
			});
		},
	);

	test("returns strict machine failure without a partial successful result", async () => {
		const result = await run(
			["gs", "list", "--format", "json"],
			listContext({ remoteFailure: true }),
		);
		expect(result.exitCode).toBe(2);
		const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
		expect(envelope).toMatchObject({
			status: "failure",
			errorType: "github-stack-discovery-failed",
			data: { command: "gh api", summary: "offline" },
		});
		expect(envelope).not.toHaveProperty("data.stacks");
	});

	test("renders a concise strict failure to stderr in human mode", async () => {
		const result = await run(["gs", "list"], listContext({ remoteFailure: true }));
		expect(result).toMatchObject({ exitCode: 2, stdout: "" });
		expect(result.stderr).toContain(
			"Could not query GitHub stacks. Check `gh auth status` and network access.",
		);
		expect(result.stderr).not.toContain("stacks:");
	});
});
