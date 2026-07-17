import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { describe, expect, it } from "vitest";

import type { MintEnvironment } from "../../src/mint/runtime-config.ts";
import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_LANDING_TOKEN_ENV_NAME,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
	planDispatchSupervision,
	type DispatchRunInput,
} from "../../src/dispatch/dispatch-run.ts";
import type { SandboxCommand } from "../../src/sandbox/contracts.ts";
import {
	cleanupDispatchRun,
	landDispatchRun,
	launchDispatchRun,
	pollDispatchRun,
	readDispatchOutcome,
	reportDispatchFailure,
	reportDispatchLanded,
	type DispatchStepDeps,
} from "../../src/dispatch/dispatch-steps.ts";
import {
	DISPATCH_PACKAGE_MANIFEST_PATH,
	DISPATCH_SETTINGS_PATH,
	type HarnessInvocation,
} from "../../src/dispatch/harness-registry.ts";
import {
	RecordingDispatchSandboxGateway,
	type DispatchSandboxBehavior,
} from "./support/dispatch-sandbox-fake.ts";
import {
	RecordingDispatchReportGateway,
	RecordingDispatchTokenMinter,
} from "./support/recording-dispatch-fakes.ts";
import {
	resolveConfiguredHarnessInvocation,
	type HarnessInvocationResolution,
	type HarnessInvocationResolver,
} from "../../src/dispatch/harness-invocation.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";

function runInput(overrides: Partial<DispatchRunInput> = {}): DispatchRunInput {
	return {
		revision,
		anchorBranch: "dispatch/widget-refactor-a1b2c3",
		anchorPrNumber: 421,
		prompt: "Rename the widget gateway methods.",
		...overrides,
	};
}

function planRunInput(): DispatchRunInput {
	const dispatchId = "dsp_01JABCDEF0123456789";
	const snapshotRef = "refs/brmem/ns/dispatch-context/feature---cache";
	const planKey = `${dispatchId}/plan/add-cache.md`;
	return {
		revision,
		anchorBranch: "dispatch/add-cache-a1b2c3",
		anchorPrNumber: 422,
		dispatchId,
		contextLocator: {
			namespace: "dispatch-context",
			dispatchId,
			contextPrefix: `${dispatchId}/`,
			planKey,
			sourceBranch: "feature/cache",
			snapshotRef,
			snapshotCommitSha: "abcdef0123456789abcdef0123456789abcdef01",
			entryLocator: `${snapshotRef}:${planKey}`,
		},
	};
}

function validEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_GITHUB_APP_ID: "4282120",
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		NS_DISPATCH_GITHUB_REPOSITORY: "nseng-ai/ns",
		ANTHROPIC_API_KEY: "model-key-fixture",
	};
}

function harnessInvocation(overrides: Partial<HarnessInvocation> = {}): HarnessInvocation {
	return {
		provisionCommands: [{ cmd: "npm", args: ["install", "-g", "fake-harness"] }],
		launchCommand: { cmd: "fake-harness", args: ["--headless"] },
		launchEnvironmentVariableNames: ["ANTHROPIC_API_KEY"],
		...overrides,
		harness: overrides.harness ?? "pi",
	};
}

interface DepsFixture {
	readonly deps: DispatchStepDeps;
	readonly sandboxes: RecordingDispatchSandboxGateway;
	readonly minter: RecordingDispatchTokenMinter;
	readonly reports: RecordingDispatchReportGateway;
	readonly operationLogs: string[];
	readonly resolverCalls: Array<{
		dispatchSettingsSource: string | null;
		packageManagerSource: string | null;
	}>;
}

function isSandboxCommand(value: unknown): value is SandboxCommand {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { cmd?: unknown; args?: unknown };
	return typeof candidate.cmd === "string" && Array.isArray(candidate.args);
}

function createDeps(
	options: {
		readonly environment?: MintEnvironment;
		readonly sandboxBehavior?: DispatchSandboxBehavior;
		readonly mintFailPurposes?: readonly string[];
		readonly reportFails?: boolean;
		readonly reportThrows?: boolean;
		readonly tokenMinterFactoryThrows?: boolean;
		readonly reportGatewayFactoryThrows?: boolean;
		readonly sandboxGatewayFactoryThrows?: boolean;
		readonly harness?: HarnessInvocationResolution;
		readonly resolveHarnessInvocation?: HarnessInvocationResolver;
	} = {},
): DepsFixture {
	const sandboxes = new RecordingDispatchSandboxGateway(options.sandboxBehavior);
	const minter = new RecordingDispatchTokenMinter(options.mintFailPurposes ?? []);
	const reports = new RecordingDispatchReportGateway({
		fails: options.reportFails ?? false,
		throws: options.reportThrows ?? false,
	});
	const operationLogs: string[] = [];
	const manualClock = createManualClock(0);
	const resolverCalls: Array<{
		dispatchSettingsSource: string | null;
		packageManagerSource: string | null;
	}> = [];
	const deps: DispatchStepDeps = {
		environment: options.environment ?? validEnvironment(),
		createDispatchTokenMinter: () => {
			if (options.tokenMinterFactoryThrows === true) {
				throw new Error("token minter factory exploded");
			}
			return minter;
		},
		createSandboxGateway: () => {
			if (options.sandboxGatewayFactoryThrows === true) {
				throw new Error("sandbox gateway factory exploded");
			}
			return sandboxes;
		},
		createReportGateway: () => {
			if (options.reportGatewayFactoryThrows === true) {
				throw new Error("report gateway factory exploded");
			}
			return reports;
		},
		operationClock: manualClock.clock,
		operationLogSink: (line) => operationLogs.push(line),
		resolveHarnessInvocation: (dispatchSettingsSource, packageManagerSource) => {
			resolverCalls.push({ dispatchSettingsSource, packageManagerSource });
			return (
				options.resolveHarnessInvocation?.(dispatchSettingsSource, packageManagerSource) ??
				options.harness ?? { ok: true, value: harnessInvocation() }
			);
		},
	};
	return { deps, sandboxes, minter, reports, operationLogs, resolverCalls };
}

describe("launchDispatchRun", () => {
	it("launches from GitHub App config without OIDC-only variables", async () => {
		const packageManagerSource = '{"packageManager":"pnpm@11.8.1"}';
		const { deps, sandboxes, minter, operationLogs, resolverCalls } = createDeps({
			sandboxBehavior: {
				files: {
					[DISPATCH_SETTINGS_PATH]: '[dispatch]\nharness = "pi"\n',
					[DISPATCH_PACKAGE_MANIFEST_PATH]: packageManagerSource,
				},
			},
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({ ok: true, sandboxName: "sbx_dispatch", harness: "pi" });
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"read",
			"write",
			"run",
			"runDetached",
		]);
		expect(sandboxes.calls[0]?.options).toEqual({
			runtime: "node24",
			timeoutMs: planDispatchSupervision().sandboxTimeoutMs,
			source: {
				repository: "nseng-ai/ns",
				revision,
				cloneToken: "token-clone-fixture",
			},
		});
		// Both checkout-owned sources are read in contract order before the
		// prompt is written or any provisioning begins.
		expect(sandboxes.calls[1]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_SETTINGS_PATH,
		});
		expect(sandboxes.calls[2]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_PACKAGE_MANIFEST_PATH,
		});
		expect(resolverCalls).toEqual([
			{
				dispatchSettingsSource: '[dispatch]\nharness = "pi"\n',
				packageManagerSource,
			},
		]);
		expect(sandboxes.calls[3]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_PROMPT_PATH,
			content: "Rename the widget gateway methods.",
		});
		expect(sandboxes.calls[4]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			command: { cmd: "npm", args: ["install", "-g", "fake-harness"] },
		});
		expect(sandboxes.calls[5]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			command: { cmd: "fake-harness", args: ["--headless"] },
			env: { ANTHROPIC_API_KEY: "model-key-fixture" },
		});
		const operationEvents = operationLogs.map(
			(line) => JSON.parse(line) as { event: string; operation: string },
		);
		expect(
			operationEvents
				.filter((event) => event.event === "operation_started")
				.map((event) => event.operation),
		).toEqual([
			"create_clone_token_minter",
			"mint_clone_token",
			"create_sandbox",
			"read_dispatch_settings",
			"read_dispatch_package_manifest",
			"write_dispatch_prompt",
			"provision_dispatch_harness",
			"launch_detached_dispatch_harness",
		]);
		expect(operationEvents.filter((event) => event.event === "operation_succeeded")).toHaveLength(
			8,
		);
		expect(operationLogs.join("\n")).not.toContain("token-clone-fixture");
		expect(operationLogs.join("\n")).not.toContain("private-key-fixture");
		expect(operationLogs.join("\n")).not.toContain("model-key-fixture");
		expect(operationLogs.join("\n")).not.toContain("Rename the widget gateway methods.");
	});

	it("fetches and verifies the exact plan snapshot before writing a brmem-first instruction and launching", async () => {
		const { deps, sandboxes } = createDeps();

		const result = await launchDispatchRun(planRunInput(), deps);

		expect(result).toEqual({ ok: true, sandboxName: "sbx_dispatch", harness: "pi" });
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"read",
			"run",
			"run",
			"run",
			"write",
			"runDetached",
		]);
		const fetchCommand = sandboxes.calls[4]?.options["command"];
		if (!isSandboxCommand(fetchCommand)) throw new Error("Expected the Snapshot fetch command.");
		expect(fetchCommand.args).toContain("refs/brmem/ns/dispatch-context/feature---cache");
		expect(fetchCommand.args).toContain("abcdef0123456789abcdef0123456789abcdef01");

		const checkCommand = sandboxes.calls[5]?.options["command"];
		if (!isSandboxCommand(checkCommand)) throw new Error("Expected the brmem check command.");
		expect(checkCommand.args).toContain("dsp_01JABCDEF0123456789/plan/add-cache.md");
		expect(checkCommand.args).toContain("dispatch-context");

		expect(sandboxes.calls[6]?.options).toMatchObject({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_PROMPT_PATH,
		});
		const instruction = sandboxes.calls[6]?.options["content"];
		expect(instruction).toMatch(/^Your first agent action must be to run this command exactly:/);
		expect(instruction).toContain("brmem get dsp_01JABCDEF0123456789/plan/add-cache.md");
		expect(instruction).toContain(
			"Treat the command output as the Saved Plan and execute that plan.",
		);
	});

	it.each([
		{
			label: "Snapshot Ref fetch",
			exitCodes: [1],
			message: "Saved Plan Snapshot Ref fetch and commit verification failed.",
			runCount: 1,
		},
		{
			label: "required Entry check",
			exitCodes: [0, 1],
			message: "Required Branch Memory Saved Plan Entry check failed.",
			runCount: 2,
		},
	])("stops before instruction write and launch when the $label fails", async (scenario) => {
		const { deps, sandboxes } = createDeps({
			sandboxBehavior: { commandExitCodes: scenario.exitCodes },
			harness: { ok: true, value: harnessInvocation({ provisionCommands: [] }) },
		});

		const result = await launchDispatchRun(planRunInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: scenario.message,
			sandboxName: "sbx_dispatch",
		});
		expect(sandboxes.calls.filter((call) => call.method === "run")).toHaveLength(scenario.runCount);
		expect(sandboxes.calls.some((call) => call.method === "write")).toBe(false);
		expect(sandboxes.calls.some((call) => call.method === "runDetached")).toBe(false);
	});

	it("never journals token material in its result", async () => {
		const { deps } = createDeps();

		const result = await launchDispatchRun(runInput(), deps);

		expect(JSON.stringify(result)).not.toContain("token");
	});

	it("rejects invalid input before touching configuration or gateways", async () => {
		const { deps, sandboxes, minter } = createDeps();

		const result = await launchDispatchRun(runInput({ anchorBranch: "feature/x" }), deps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("invalid-input");
		expect(sandboxes.calls).toEqual([]);
		expect(minter.calls).toEqual([]);
	});

	it("names only the invalid variable when the runtime configuration is unusable", async () => {
		const { deps, sandboxes } = createDeps({
			environment: { ...validEnvironment(), NS_DISPATCH_GITHUB_APP_ID: "not-a-number" },
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message: "Dispatch configuration is invalid: NS_DISPATCH_GITHUB_APP_ID.",
		});
		expect(sandboxes.calls).toEqual([]);
	});

	it("returns the created sandbox for orchestration cleanup when no harness is configured", async () => {
		const { deps, sandboxes } = createDeps({
			harness: {
				ok: false,
				code: "harness-not-configured",
				message: "The dispatched checkout declares no [dispatch] harness.",
			},
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message: "The dispatched checkout declares no [dispatch] harness.",
			sandboxName: "sbx_dispatch",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read"]);
	});

	it("returns before prompt write or provisioning for a registry-unsupported harness", async () => {
		const { deps, sandboxes } = createDeps({
			resolveHarnessInvocation: resolveConfiguredHarnessInvocation,
			sandboxBehavior: {
				files: {
					[DISPATCH_SETTINGS_PATH]: '[dispatch]\nharness = "claude-code"\n',
					[DISPATCH_PACKAGE_MANIFEST_PATH]: '{"packageManager":"pnpm@11.8.1"}',
				},
			},
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-misconfigured");
		expect(result.message).not.toContain("claude-code");
		expect(result.sandboxName).toBe("sbx_dispatch");
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read"]);
	});

	it("returns the sandbox when the dispatch settings read fails", async () => {
		const { deps, sandboxes, resolverCalls } = createDeps({
			sandboxBehavior: { readFails: true },
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message:
				"Dispatch configuration is invalid: ns.toml could not be read from the dispatched checkout.",
			sandboxName: "sbx_dispatch",
		});
		expect(resolverCalls).toEqual([]);
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read"]);
	});

	it("returns the sandbox when the package manifest read fails", async () => {
		const { deps, sandboxes, resolverCalls } = createDeps({
			sandboxBehavior: { readFailurePaths: [DISPATCH_PACKAGE_MANIFEST_PATH] },
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message:
				"Dispatch configuration is invalid: ts/package.json#packageManager could not be read from the dispatched checkout.",
			sandboxName: "sbx_dispatch",
		});
		expect(resolverCalls).toEqual([]);
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read"]);
	});

	it("returns before prompt write, provisioning, or launch when packageManager is invalid", async () => {
		const invalidValue = "pnpm@11.8.1;echo-do-not-expose";
		const { deps, sandboxes } = createDeps({
			resolveHarnessInvocation: resolveConfiguredHarnessInvocation,
			sandboxBehavior: {
				files: {
					[DISPATCH_SETTINGS_PATH]: '[dispatch]\nharness = "pi"\n',
					[DISPATCH_PACKAGE_MANIFEST_PATH]: JSON.stringify({
						packageManager: invalidValue,
					}),
				},
			},
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("dispatch-misconfigured");
		expect(result.message).toContain("ts/package.json#packageManager");
		expect(result.message).not.toContain(invalidValue);
		expect(result.sandboxName).toBe("sbx_dispatch");
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read"]);
	});

	it("returns the created sandbox when a declared launch variable is missing", async () => {
		const environment: MintEnvironment = { ...validEnvironment(), ANTHROPIC_API_KEY: undefined };
		const { deps, sandboxes } = createDeps({ environment });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message: "Dispatch configuration is invalid: ANTHROPIC_API_KEY.",
			sandboxName: "sbx_dispatch",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read"]);
	});

	it("maps a clone mint failure to launch-failed without creating a sandbox", async () => {
		const { deps, sandboxes, operationLogs } = createDeps({ mintFailPurposes: ["clone"] });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Clone token mint failed.",
		});
		expect(sandboxes.calls).toEqual([]);
		expect(operationLogs.map((line) => JSON.parse(line))).toContainEqual({
			event: "operation_failed",
			operation: "mint_clone_token",
			durationMs: 0,
			repository: "nseng-ai/ns",
			purpose: "clone",
			anchorPrNumber: 421,
			reason: "github-token-mint-failed",
			diagnostic: "token mint diagnostic",
		});
		expect(operationLogs.join("\n")).not.toContain("private-key-fixture");
		expect(operationLogs.join("\n")).not.toContain("model-key-fixture");
		expect(operationLogs.join("\n")).not.toContain("Rename the widget gateway methods.");
	});

	it("returns the created sandbox when provisioning exits non-zero", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { commandExitCode: 1 } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Harness provisioning failed.",
			sandboxName: "sbx_dispatch",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"read",
			"write",
			"run",
		]);
	});

	it("returns the created sandbox when the prompt write fails", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { writeFails: true } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.sandboxName).toBe("sbx_dispatch");
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "read", "write"]);
	});

	it("returns the created sandbox when the detached launch fails", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { detachedFails: true } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Detached harness launch failed.",
			sandboxName: "sbx_dispatch",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"read",
			"write",
			"run",
			"runDetached",
		]);
	});

	it.each([
		["create", { createThrows: true }, undefined],
		["settings read", { readThrows: true }, "sbx_dispatch"],
		["prompt write", { writeThrows: true }, "sbx_dispatch"],
		["provision command", { commandThrows: true }, "sbx_dispatch"],
		["detached launch", { detachedThrows: true }, "sbx_dispatch"],
	] as const)(
		"normalizes a throwing %s boundary and exposes only a safe sandbox name",
		async (_label, sandboxBehavior, sandboxName) => {
			const { deps } = createDeps({ sandboxBehavior });

			const result = await launchDispatchRun(runInput(), deps);

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("Expected a failure.");
			expect(result.sandboxName).toBe(sandboxName);
			expect(JSON.stringify(result)).not.toContain("model-key-fixture");
			expect(JSON.stringify(result)).not.toContain("private-key-fixture");
		},
	);

	it("logs and normalizes a throwing sandbox gateway factory as sandbox creation", async () => {
		const { deps, operationLogs } = createDeps({ sandboxGatewayFactoryThrows: true });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Sandbox creation failed.",
		});
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
		expect(operationLogs.map((line) => JSON.parse(line))).toContainEqual({
			event: "operation_failed",
			operation: "create_sandbox",
			repository: "nseng-ai/ns",
			revision,
			anchorPrNumber: 421,
			durationMs: 0,
			reason: "unexpected-exception",
			diagnostic: "sandbox gateway factory exploded",
		});
	});

	it("fails safe on an unusable sandbox name", async () => {
		const { deps } = createDeps({ sandboxBehavior: { createdName: "bad name!" } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.code).toBe("launch-failed");
	});
});

describe("pollDispatchRun", () => {
	it("reads the result path and reports running while the file is absent", async () => {
		const { deps, sandboxes } = createDeps();

		const result = await pollDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true, phase: "running" });
		expect(sandboxes.calls).toEqual([
			{ method: "read", options: { sandboxName: "sbx_dispatch", path: DISPATCH_RESULT_PATH } },
		]);
	});

	it("reports done once the harness wrote its result, even an invalid one", async () => {
		const { deps } = createDeps({
			sandboxBehavior: { files: { [DISPATCH_RESULT_PATH]: "not json" } },
		});

		const result = await pollDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true, phase: "done" });
	});

	it("maps a read throw to poll-failed", async () => {
		const { deps } = createDeps({ sandboxBehavior: { readThrows: true } });

		expect(await pollDispatchRun({ sandboxName: "sbx_dispatch" }, deps)).toEqual({
			ok: false,
			code: "poll-failed",
			message: "Dispatch result read failed.",
		});
	});

	it("maps a read failure to poll-failed", async () => {
		const { deps } = createDeps({ sandboxBehavior: { readFails: true } });

		const result = await pollDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({
			ok: false,
			code: "poll-failed",
			message: "Dispatch result read failed.",
		});
	});
});

describe("readDispatchOutcome", () => {
	it("harvests the outcome, summary, and decision log", async () => {
		const { deps } = createDeps({
			sandboxBehavior: {
				files: {
					[DISPATCH_RESULT_PATH]: '{"outcome":"completed","summary":"Renamed 4 methods."}',
					[DISPATCH_DECISION_LOG_PATH]: "- Chose the smaller refactor.",
				},
			},
		});

		const result = await readDispatchOutcome({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({
			ok: true,
			outcome: "completed",
			summary: "Renamed 4 methods.",
			decisionLog: "- Chose the smaller refactor.",
		});
	});

	it("treats a vanished or malformed result file as an invalid outcome", async () => {
		const { deps } = createDeps();

		const result = await readDispatchOutcome({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true, outcome: "invalid", decisionLog: null });
	});

	it("degrades a missing decision log to null rather than failing the run", async () => {
		const { deps } = createDeps({
			sandboxBehavior: { files: { [DISPATCH_RESULT_PATH]: '{"outcome":"completed"}' } },
		});

		const result = await readDispatchOutcome({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true, outcome: "completed", decisionLog: null });
	});

	it("maps a result read failure to a safe failure", async () => {
		const { deps } = createDeps({ sandboxBehavior: { readFails: true } });

		const result = await readDispatchOutcome({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: false });
	});

	it("logs and normalizes a throwing sandbox gateway factory as the final result read", async () => {
		const { deps, operationLogs } = createDeps({ sandboxGatewayFactoryThrows: true });

		const result = await readDispatchOutcome({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: false });
		expect(JSON.parse(JSON.stringify(result))).toEqual(result);
		expect(operationLogs.map((line) => JSON.parse(line))).toContainEqual({
			event: "operation_failed",
			operation: "read_final_dispatch_result",
			sandboxName: "sbx_dispatch",
			path: DISPATCH_RESULT_PATH,
			durationMs: 0,
			reason: "unexpected-exception",
			diagnostic: "sandbox gateway factory exploded",
		});
	});
});

describe("landDispatchRun", () => {
	it("late-mints the landing token and injects it only into the single landing command's environment", async () => {
		const { deps, sandboxes, minter } = createDeps();

		const result = await landDispatchRun(
			{ sandboxName: "sbx_dispatch", anchorBranch: "dispatch/widget-refactor-a1b2c3" },
			deps,
		);

		expect(result).toEqual({ ok: true });
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "landing" }]);
		expect(sandboxes.calls).toHaveLength(1);
		const call = sandboxes.calls[0];
		expect(call?.method).toBe("run");
		expect(call?.options["env"]).toEqual({
			[DISPATCH_LANDING_TOKEN_ENV_NAME]: "token-landing-fixture",
		});
		const command = call?.options["command"];
		if (!isSandboxCommand(command)) throw new Error("Expected a sandbox command.");
		expect(command.cmd).toBe("sh");
		// The token reaches the command through its environment, never argv.
		expect(command.args.join(" ")).not.toContain("token-landing-fixture");
		expect(command.args.join(" ")).toContain("HEAD:refs/heads/dispatch/widget-refactor-a1b2c3");
	});

	it("re-validates the anchor branch where it is interpolated", async () => {
		const { deps, sandboxes, minter } = createDeps();

		const result = await landDispatchRun(
			{ sandboxName: "sbx_dispatch", anchorBranch: "dispatch/bad branch" },
			deps,
		);

		expect(result).toEqual({
			ok: false,
			code: "landing-failed",
			message: "Anchor branch name is invalid.",
		});
		expect(minter.calls).toEqual([]);
		expect(sandboxes.calls).toEqual([]);
	});

	it("maps a landing mint failure to landing-failed without running anything", async () => {
		const { deps, sandboxes } = createDeps({ mintFailPurposes: ["landing"] });

		const result = await landDispatchRun(
			{ sandboxName: "sbx_dispatch", anchorBranch: "dispatch/widget" },
			deps,
		);

		expect(result).toEqual({
			ok: false,
			code: "landing-failed",
			message: "Landing token mint failed.",
		});
		expect(sandboxes.calls).toEqual([]);
	});

	it("maps a throwing landing command to landing-failed without exposing its token", async () => {
		const { deps } = createDeps({ sandboxBehavior: { commandThrows: true } });

		const result = await landDispatchRun(
			{ sandboxName: "sbx_dispatch", anchorBranch: "dispatch/widget" },
			deps,
		);

		expect(result).toEqual({ ok: false, code: "landing-failed", message: "Landing push failed." });
		expect(JSON.stringify(result)).not.toContain("token-landing-fixture");
	});

	it("maps a non-zero push exit code to landing-failed", async () => {
		const { deps } = createDeps({ sandboxBehavior: { commandExitCode: 1 } });

		const result = await landDispatchRun(
			{ sandboxName: "sbx_dispatch", anchorBranch: "dispatch/widget" },
			deps,
		);

		expect(result).toEqual({ ok: false, code: "landing-failed", message: "Landing push failed." });
	});
});

describe("cleanupDispatchRun", () => {
	it("stops the sandbox", async () => {
		const { deps, sandboxes } = createDeps();

		const result = await cleanupDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true });
		expect(sandboxes.calls).toEqual([{ method: "stop", options: { sandboxName: "sbx_dispatch" } }]);
	});

	it("maps a stop throw to sandbox-cleanup-failed", async () => {
		const { deps } = createDeps({ sandboxBehavior: { stopThrows: true } });

		expect(await cleanupDispatchRun({ sandboxName: "sbx_dispatch" }, deps)).toEqual({
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
		});
	});

	it("maps a stop failure to sandbox-cleanup-failed", async () => {
		const { deps } = createDeps({ sandboxBehavior: { stopFails: true } });

		const result = await cleanupDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
		});
	});
});

describe("reportDispatchLanded", () => {
	it("publishes the decision log to the anchor PR", async () => {
		const { deps, reports } = createDeps();

		const result = await reportDispatchLanded(
			{ anchorPrNumber: 421, decisionLog: "- Chose A." },
			deps,
		);

		expect(result).toEqual({ ok: true });
		expect(reports.publishCalls).toEqual([{ anchorPrNumber: 421, decisionLog: "- Chose A." }]);
	});

	it("fails safe when the runtime configuration is unusable", async () => {
		const { deps, reports } = createDeps({
			environment: { ...validEnvironment(), NS_DISPATCH_GITHUB_APP_ID: undefined },
		});

		const result = await reportDispatchLanded({ anchorPrNumber: 421, decisionLog: null }, deps);

		expect(result).toEqual({ ok: false });
		expect(reports.publishCalls).toEqual([]);
	});

	it("normalizes a report operation throw to a safe failure", async () => {
		const { deps } = createDeps({ reportThrows: true });

		const result = await reportDispatchLanded({ anchorPrNumber: 421, decisionLog: null }, deps);

		expect(result).toEqual({ ok: false });
	});

	it.each([
		[
			"token minter",
			{ tokenMinterFactoryThrows: true },
			"create_report_token_minter",
			"token minter factory exploded",
		],
		[
			"report gateway",
			{ reportGatewayFactoryThrows: true },
			"publish_anchor_pr_decision_log",
			"report gateway factory exploded",
		],
	] as const)(
		"logs and normalizes a %s factory throw at the step boundary",
		async (_label, options, failedOperation, rawError) => {
			const { deps, operationLogs } = createDeps(options);

			const result = await reportDispatchLanded({ anchorPrNumber: 421, decisionLog: null }, deps);

			expect(result).toEqual({ ok: false });
			expect(JSON.parse(JSON.stringify(result))).toEqual(result);
			expect(
				operationLogs
					.map(
						(line) =>
							JSON.parse(line) as {
								event: string;
								operation: string;
								diagnostic?: string;
							},
					)
					.some(
						(event) =>
							event.event === "operation_failed" &&
							event.operation === failedOperation &&
							event.diagnostic === rawError,
					),
			).toBe(true);
		},
	);
});

describe("reportDispatchFailure", () => {
	it("posts the failure state to the anchor PR", async () => {
		const { deps, reports } = createDeps();

		const result = await reportDispatchFailure(
			{
				anchorPrNumber: 421,
				anchorBranch: "dispatch/widget",
				code: "harness-failed",
				message: "The dispatched harness run reported failure.",
			},
			deps,
		);

		expect(result).toEqual({ ok: true });
		expect(reports.failureCalls).toEqual([
			{
				anchorPrNumber: 421,
				anchorBranch: "dispatch/widget",
				code: "harness-failed",
				message: "The dispatched harness run reported failure.",
			},
		]);
	});

	it("reflects a report gateway failure", async () => {
		const { deps } = createDeps({ reportFails: true });

		const result = await reportDispatchFailure(
			{
				anchorPrNumber: 421,
				anchorBranch: "dispatch/widget",
				code: "poll-failed",
				message: "Supervision poll failed.",
			},
			deps,
		);

		expect(result).toEqual({ ok: false });
	});
});
