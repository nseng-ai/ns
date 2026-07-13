import { describe, expect, it } from "vitest";

import type { MintEnvironment } from "../../src/mint/runtime-config.ts";
import type { DispatchTokenMinter, DispatchTokenMintResult } from "../../src/mint/mint-core.ts";
import type { DispatchReportGateway } from "../../src/dispatch/anchor-pr-report.ts";
import {
	DISPATCH_DECISION_LOG_PATH,
	DISPATCH_LANDING_TOKEN_ENV_NAME,
	DISPATCH_PROMPT_PATH,
	DISPATCH_RESULT_PATH,
	DISPATCH_SETTINGS_PATH,
	planDispatchSupervision,
	type DispatchRunFailureCode,
	type DispatchRunInput,
	type DispatchSandboxCommand,
	type DispatchSandboxGateway,
} from "../../src/dispatch/dispatch-run.ts";
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
import type {
	HarnessInvocation,
	HarnessInvocationResolution,
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

function validEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_GITHUB_APP_ID: "4282120",
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY:
			"-----BEGIN PRIVATE KEY-----\\nprivate-key-fixture\\n-----END PRIVATE KEY-----\\n",
		NS_DISPATCH_SANDBOX_MINT_SECRET: "landing-secret",
		NS_DISPATCH_GITHUB_REPOSITORY: "nseng-ai/ns",
		NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
		ANTHROPIC_API_KEY: "model-key-fixture",
	};
}

function harnessInvocation(overrides: Partial<HarnessInvocation> = {}): HarnessInvocation {
	return {
		provisionCommands: [{ cmd: "npm", args: ["install", "-g", "fake-harness"] }],
		launchCommand: { cmd: "fake-harness", args: ["--headless"] },
		launchEnvironmentVariableNames: ["ANTHROPIC_API_KEY"],
		...overrides,
	};
}

interface SandboxCall {
	readonly method: string;
	readonly options: Record<string, unknown>;
}

interface FakeSandboxBehavior {
	readonly createFails?: boolean;
	readonly createdName?: string;
	readonly writeFails?: boolean;
	readonly commandExitCode?: number;
	readonly commandFails?: boolean;
	readonly detachedFails?: boolean;
	readonly readFails?: boolean;
	readonly files?: Readonly<Record<string, string>>;
	readonly stopFails?: boolean;
}

class FakeDispatchSandboxGateway implements DispatchSandboxGateway {
	readonly #behavior: FakeSandboxBehavior;
	readonly calls: SandboxCall[] = [];

	constructor(behavior: FakeSandboxBehavior = {}) {
		this.#behavior = behavior;
	}

	async createDispatchSandbox(options: {
		readonly runtime: "node24";
		readonly timeoutMs: number;
		readonly source: {
			readonly repository: string;
			readonly revision: string;
			readonly cloneToken: string;
		};
	}) {
		this.calls.push({ method: "create", options: { ...options } });
		if (this.#behavior.createFails === true) return { ok: false } as const;
		return { ok: true, sandboxName: this.#behavior.createdName ?? "sbx_dispatch" } as const;
	}

	async writeSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
		readonly content: string;
	}) {
		this.calls.push({ method: "write", options: { ...options } });
		if (this.#behavior.writeFails === true) return { ok: false } as const;
		return { ok: true } as const;
	}

	async runSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: DispatchSandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}) {
		this.calls.push({ method: "run", options: { ...options } });
		if (this.#behavior.commandFails === true) return { ok: false } as const;
		return { ok: true, exitCode: this.#behavior.commandExitCode ?? 0 } as const;
	}

	async runDetachedSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: DispatchSandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}) {
		this.calls.push({ method: "runDetached", options: { ...options } });
		if (this.#behavior.detachedFails === true) return { ok: false } as const;
		return { ok: true } as const;
	}

	async readSandboxFile(options: { readonly sandboxName: string; readonly path: string }) {
		this.calls.push({ method: "read", options: { ...options } });
		if (this.#behavior.readFails === true) return { ok: false } as const;
		const content = this.#behavior.files?.[options.path];
		return { ok: true, content: content ?? null } as const;
	}

	async stopSandbox(options: { readonly sandboxName: string }) {
		this.calls.push({ method: "stop", options: { ...options } });
		if (this.#behavior.stopFails === true) return { ok: false } as const;
		return { ok: true } as const;
	}
}

class RecordingDispatchTokenMinter implements DispatchTokenMinter {
	readonly calls: Array<{ repository: string; purpose: string }> = [];
	readonly #failPurposes: ReadonlySet<string>;

	constructor(failPurposes: readonly string[] = []) {
		this.#failPurposes = new Set(failPurposes);
	}

	async mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: "clone" | "landing";
	}): Promise<DispatchTokenMintResult> {
		this.calls.push({ ...options });
		if (this.#failPurposes.has(options.purpose)) {
			return { ok: false, error: { code: "github-token-mint-failed" } };
		}
		return {
			ok: true,
			value: {
				token: `token-${options.purpose}-fixture`,
				expiresAt: "2026-07-13T00:00:00Z",
				repository: options.repository,
				purpose: options.purpose,
			},
		};
	}
}

class RecordingDispatchReportGateway implements DispatchReportGateway {
	readonly publishCalls: Array<{ anchorPrNumber: number; decisionLog: string | null }> = [];
	readonly failureCalls: Array<{
		anchorPrNumber: number;
		anchorBranch: string;
		code: string;
		message: string;
	}> = [];
	readonly #fails: boolean;

	constructor(options: { readonly fails?: boolean } = {}) {
		this.#fails = options.fails ?? false;
	}

	async publishAnchorPrDecisionLog(options: {
		readonly anchorPrNumber: number;
		readonly decisionLog: string | null;
	}) {
		this.publishCalls.push({ ...options });
		return this.#fails ? ({ ok: false } as const) : ({ ok: true } as const);
	}

	async ensureAnchorPrFailureComment(options: {
		readonly anchorPrNumber: number;
		readonly anchorBranch: string;
		readonly code: DispatchRunFailureCode;
		readonly message: string;
	}) {
		this.failureCalls.push({ ...options });
		return this.#fails ? ({ ok: false } as const) : ({ ok: true } as const);
	}
}

interface DepsFixture {
	readonly deps: DispatchStepDeps;
	readonly sandboxes: FakeDispatchSandboxGateway;
	readonly minter: RecordingDispatchTokenMinter;
	readonly reports: RecordingDispatchReportGateway;
	readonly resolverCalls: Array<string | null>;
}

function createDeps(
	options: {
		readonly environment?: MintEnvironment;
		readonly sandboxBehavior?: FakeSandboxBehavior;
		readonly mintFailPurposes?: readonly string[];
		readonly reportFails?: boolean;
		readonly harness?: HarnessInvocationResolution;
	} = {},
): DepsFixture {
	const sandboxes = new FakeDispatchSandboxGateway(options.sandboxBehavior);
	const minter = new RecordingDispatchTokenMinter(options.mintFailPurposes ?? []);
	const reports = new RecordingDispatchReportGateway({ fails: options.reportFails ?? false });
	const resolverCalls: Array<string | null> = [];
	const deps: DispatchStepDeps = {
		environment: options.environment ?? validEnvironment(),
		createDispatchTokenMinter: () => minter,
		createSandboxGateway: () => sandboxes,
		createReportGateway: () => reports,
		resolveHarnessInvocation: (dispatchSettingsSource) => {
			resolverCalls.push(dispatchSettingsSource);
			return options.harness ?? { ok: true, value: harnessInvocation() };
		},
	};
	return { deps, sandboxes, minter, reports, resolverCalls };
}

describe("launchDispatchRun", () => {
	it("mints a clone token, creates the sandbox over the exact SHA, resolves the checkout's harness, provisions, and launches detached", async () => {
		const { deps, sandboxes, minter, resolverCalls } = createDeps({
			sandboxBehavior: { files: { [DISPATCH_SETTINGS_PATH]: '[dispatch]\nharness = "pi"\n' } },
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({ ok: true, sandboxName: "sbx_dispatch" });
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
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
		// Harness choice is read from the checkout's own ns.toml at the
		// dispatched SHA, then handed to the configuration seam.
		expect(sandboxes.calls[1]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_SETTINGS_PATH,
		});
		expect(resolverCalls).toEqual(['[dispatch]\nharness = "pi"\n']);
		expect(sandboxes.calls[2]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			path: DISPATCH_PROMPT_PATH,
			content: "Rename the widget gateway methods.",
		});
		expect(sandboxes.calls[3]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			command: { cmd: "npm", args: ["install", "-g", "fake-harness"] },
		});
		expect(sandboxes.calls[4]?.options).toEqual({
			sandboxName: "sbx_dispatch",
			command: { cmd: "fake-harness", args: ["--headless"] },
			env: { ANTHROPIC_API_KEY: "model-key-fixture" },
		});
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

	it("stops the created sandbox and fails as misconfigured when the checkout configures no harness", async () => {
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
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "stop"]);
	});

	it("stops the created sandbox when the dispatch settings read fails", async () => {
		const { deps, sandboxes, resolverCalls } = createDeps({
			sandboxBehavior: { readFails: true },
		});

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Reading the checkout's dispatch settings failed.",
		});
		expect(resolverCalls).toEqual([]);
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "stop"]);
	});

	it("stops the created sandbox when a declared launch variable is missing", async () => {
		const environment: MintEnvironment = { ...validEnvironment(), ANTHROPIC_API_KEY: undefined };
		const { deps, sandboxes } = createDeps({ environment });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "dispatch-misconfigured",
			message: "Dispatch configuration is invalid: ANTHROPIC_API_KEY.",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "stop"]);
	});

	it("maps a clone mint failure to launch-failed without creating a sandbox", async () => {
		const { deps, sandboxes } = createDeps({ mintFailPurposes: ["clone"] });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Clone token mint failed.",
		});
		expect(sandboxes.calls).toEqual([]);
	});

	it("stops the created sandbox when provisioning exits non-zero", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { commandExitCode: 1 } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Harness provisioning failed.",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"write",
			"run",
			"stop",
		]);
	});

	it("stops the created sandbox when the prompt write fails", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { writeFails: true } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result.ok).toBe(false);
		expect(sandboxes.calls.map((call) => call.method)).toEqual(["create", "read", "write", "stop"]);
	});

	it("stops the created sandbox when the detached launch fails", async () => {
		const { deps, sandboxes } = createDeps({ sandboxBehavior: { detachedFails: true } });

		const result = await launchDispatchRun(runInput(), deps);

		expect(result).toEqual({
			ok: false,
			code: "launch-failed",
			message: "Detached harness launch failed.",
		});
		expect(sandboxes.calls.map((call) => call.method)).toEqual([
			"create",
			"read",
			"write",
			"run",
			"runDetached",
			"stop",
		]);
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

		expect(result).toEqual({ ok: true, phase: "running", ticks: 0 });
		expect(sandboxes.calls).toEqual([
			{ method: "read", options: { sandboxName: "sbx_dispatch", path: DISPATCH_RESULT_PATH } },
		]);
	});

	it("reports done once the harness wrote its result, even an invalid one", async () => {
		const { deps } = createDeps({
			sandboxBehavior: { files: { [DISPATCH_RESULT_PATH]: "not json" } },
		});

		const result = await pollDispatchRun({ sandboxName: "sbx_dispatch" }, deps);

		expect(result).toEqual({ ok: true, phase: "done", ticks: 0 });
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
		const command = call?.options["command"] as DispatchSandboxCommand;
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
