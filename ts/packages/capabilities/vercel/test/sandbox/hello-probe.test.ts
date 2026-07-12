import { describe, expect, it } from "vitest";

import {
	SANDBOX_HELLO_MARKER,
	SANDBOX_HELLO_TIMEOUT_MS,
	runSandboxHelloProbe,
	type CloneTokenMintGateway,
	type CloneTokenMintResult,
	type CreateVercelGitSandboxOptions,
	type CreateVercelSandboxResult,
	type SandboxHelloProbeContext,
	type VercelSandboxCleanupResult,
	type VercelSandboxCommandResult,
	type VercelSandboxGateway,
	type VercelSandboxSession,
} from "../../src/sandbox/hello-probe.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";
const otherRevision = "abcdef0123456789abcdef0123456789abcdef01";
const cloneToken = "clone-token-must-not-leak";

class InMemoryCloneTokenMintGateway implements CloneTokenMintGateway {
	readonly #result: CloneTokenMintResult;
	readonly calls: Array<{ repository: string }> = [];

	constructor(result: CloneTokenMintResult) {
		this.#result = result;
	}

	async mintCloneToken(options: { readonly repository: string }): Promise<CloneTokenMintResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

class InMemoryVercelSandboxSession implements VercelSandboxSession {
	readonly #commandResult: VercelSandboxCommandResult;
	readonly #cleanupResult: VercelSandboxCleanupResult;
	readonly name: string;
	commandCalls = 0;
	stopCalls = 0;

	constructor(options: {
		readonly commandResult: VercelSandboxCommandResult;
		readonly cleanupResult?: VercelSandboxCleanupResult;
		readonly name?: string;
	}) {
		this.#commandResult = options.commandResult;
		this.#cleanupResult = options.cleanupResult ?? { ok: true };
		this.name = options.name ?? "sbx-hello-probe";
	}

	async runFixedHelloProbe(): Promise<VercelSandboxCommandResult> {
		this.commandCalls += 1;
		return this.#commandResult;
	}

	async stop(): Promise<VercelSandboxCleanupResult> {
		this.stopCalls += 1;
		return this.#cleanupResult;
	}
}

class InMemoryVercelSandboxGateway implements VercelSandboxGateway {
	readonly #result: CreateVercelSandboxResult;
	readonly createCalls: CreateVercelGitSandboxOptions[] = [];

	constructor(result: CreateVercelSandboxResult) {
		this.#result = result;
	}

	async createGitSandbox(
		options: CreateVercelGitSandboxOptions,
	): Promise<CreateVercelSandboxResult> {
		this.createCalls.push({
			...options,
			source: { ...options.source },
			credentials: { ...options.credentials },
		});
		return this.#result;
	}
}

function successfulCommand(observedSha = revision): VercelSandboxCommandResult {
	return {
		ok: true,
		exitCode: 0,
		stdout: `${SANDBOX_HELLO_MARKER}\n${observedSha}\n`,
	};
}

function createContext(
	options: {
		readonly mintResult?: CloneTokenMintResult;
		readonly commandResult?: VercelSandboxCommandResult;
		readonly cleanupResult?: VercelSandboxCleanupResult;
		readonly createResult?: "success" | "failure";
	} = {},
): SandboxHelloProbeContext & {
	readonly cloneTokens: InMemoryCloneTokenMintGateway;
	readonly sandboxes: InMemoryVercelSandboxGateway;
	readonly session: InMemoryVercelSandboxSession;
} {
	const session = new InMemoryVercelSandboxSession({
		commandResult: options.commandResult ?? successfulCommand(),
		...(options.cleanupResult === undefined ? {} : { cleanupResult: options.cleanupResult }),
	});
	const cloneTokens = new InMemoryCloneTokenMintGateway(
		options.mintResult ?? { ok: true, token: cloneToken },
	);
	const sandboxes = new InMemoryVercelSandboxGateway(
		options.createResult === "failure" ? { ok: false } : { ok: true, sandbox: session },
	);
	return { cloneTokens, sandboxes, session };
}

function probeOptions() {
	return {
		repository: "NSENG-AI/NS",
		revision,
		vercelOidcToken: "development-oidc-token",
		vercelProjectId: "prj_dispatch",
		vercelTeamId: "team_dispatch",
	} as const;
}

describe("runSandboxHelloProbe", () => {
	it("mints a clone token, checks out the exact revision, verifies output, and cleans up", async () => {
		const context = createContext();

		const result = await runSandboxHelloProbe(probeOptions(), context);

		expect(result).toEqual({
			ok: true,
			repository: "nseng-ai/ns",
			requestedRevision: revision,
			observedSha: revision,
			markerOutput: SANDBOX_HELLO_MARKER,
			sandboxName: "sbx-hello-probe",
		});
		expect(context.cloneTokens.calls).toEqual([{ repository: "nseng-ai/ns" }]);
		expect(context.sandboxes.createCalls).toEqual([
			{
				runtime: "node24",
				persistent: false,
				timeoutMs: SANDBOX_HELLO_TIMEOUT_MS,
				source: {
					type: "git",
					url: "https://github.com/nseng-ai/ns.git",
					username: "x-access-token",
					password: cloneToken,
					depth: 1,
					revision,
				},
				credentials: {
					oidcToken: "development-oidc-token",
					projectId: "prj_dispatch",
					teamId: "team_dispatch",
				},
			},
		]);
		expect(context.session.commandCalls).toBe(1);
		expect(context.session.stopCalls).toBe(1);
		expect(JSON.stringify(result)).not.toContain(cloneToken);
		expect(JSON.stringify(result)).not.toContain("development-oidc-token");
	});

	it("does not create a Sandbox when clone-token minting fails", async () => {
		const context = createContext({ mintResult: { ok: false } });

		const result = await runSandboxHelloProbe(probeOptions(), context);

		expect(result).toEqual({
			ok: false,
			code: "clone-token-mint-failed",
			message: "Clone token mint failed.",
		});
		expect(context.sandboxes.createCalls).toEqual([]);
		expect(context.session.stopCalls).toBe(0);
	});

	it.each([
		{
			name: "command gateway failure",
			commandResult: { ok: false } as const,
			expectedCode: "probe-command-failed",
		},
		{
			name: "non-zero command exit",
			commandResult: { ok: true, exitCode: 7, stdout: "vendor detail" } as const,
			expectedCode: "probe-command-failed",
		},
		{
			name: "marker mismatch",
			commandResult: { ok: true, exitCode: 0, stdout: `wrong-marker\n${revision}\n` } as const,
			expectedCode: "probe-output-invalid",
		},
		{
			name: "SHA mismatch",
			commandResult: successfulCommand(otherRevision),
			expectedCode: "revision-mismatch",
		},
	] as const)(
		"returns a safe failure and cleans up after $name",
		async ({ commandResult, expectedCode }) => {
			const context = createContext({ commandResult });

			const result = await runSandboxHelloProbe(probeOptions(), context);

			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("Expected probe failure.");
			expect(result.code).toBe(expectedCode);
			expect(JSON.stringify(result)).not.toContain("vendor detail");
			expect(JSON.stringify(result)).not.toContain(cloneToken);
			expect(context.session.stopCalls).toBe(1);
		},
	);

	it("reports cleanup failure after an otherwise successful probe", async () => {
		const context = createContext({ cleanupResult: { ok: false } });

		const result = await runSandboxHelloProbe(probeOptions(), context);

		expect(result).toEqual({
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
		});
		expect(context.session.stopCalls).toBe(1);
	});

	it("rejects a non-commit revision before minting or creating", async () => {
		const context = createContext();

		const result = await runSandboxHelloProbe({ ...probeOptions(), revision: "main" }, context);

		expect(result.ok).toBe(false);
		expect(context.cloneTokens.calls).toEqual([]);
		expect(context.sandboxes.createCalls).toEqual([]);
	});
});
