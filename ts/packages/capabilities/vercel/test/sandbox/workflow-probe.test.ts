import { describe, expect, it } from "vitest";

import type { DispatchTokenMinter, DispatchTokenMintResult } from "../../src/mint/mint-core.ts";
import type { MintEnvironment } from "../../src/mint/runtime-config.ts";
import {
	SANDBOX_HELLO_MARKER,
	SANDBOX_HELLO_TIMEOUT_MS,
	type CreateVercelGitSandboxOptions,
	type CreateVercelSandboxResult,
	type VercelSandboxCleanupResult,
	type VercelSandboxCommandResult,
	type VercelSandboxGateway,
	type VercelSandboxSession,
} from "../../src/sandbox/hello-probe.ts";
import {
	createMinterCloneTokenGateway,
	runWorkflowSandboxProbe,
	type WorkflowSandboxProbeGateways,
} from "../../src/sandbox/workflow-probe.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";
const cloneToken = "in-process-minted-token-must-not-leak";
const privateKey =
	"-----BEGIN RSA PRIVATE KEY-----\\nfixture-key-material\\n-----END RSA PRIVATE KEY-----";

function validEnvironment(): MintEnvironment {
	return {
		NS_DISPATCH_GITHUB_APP_ID: "4282120",
		NS_DISPATCH_GITHUB_APP_INSTALLATION_ID: "146155769",
		NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: privateKey,
		NS_DISPATCH_SANDBOX_MINT_SECRET: "retired-but-still-deployed",
		NS_DISPATCH_GITHUB_REPOSITORY: "NSENG-AI/NS",
		NS_DISPATCH_VERCEL_TEAM_ID: "team_dispatch",
		NS_DISPATCH_VERCEL_PROJECT_ID: "prj_dispatch",
		NS_DISPATCH_VERCEL_OIDC_ISSUER: "https://oidc.vercel.com/nseng-ai",
		NS_DISPATCH_VERCEL_OIDC_AUDIENCE: "https://vercel.com/nseng-ai",
	};
}

class InMemoryDispatchTokenMinter implements DispatchTokenMinter {
	readonly #result: DispatchTokenMintResult;
	readonly calls: Array<{ repository: string; purpose: string }> = [];

	constructor(result: DispatchTokenMintResult) {
		this.#result = result;
	}

	async mintDispatchToken(options: {
		readonly repository: string;
		readonly purpose: "clone" | "landing";
	}): Promise<DispatchTokenMintResult> {
		this.calls.push({ ...options });
		return this.#result;
	}
}

class InMemoryVercelSandboxSession implements VercelSandboxSession {
	readonly name = "sbx-workflow-probe";
	commandCalls = 0;
	stopCalls = 0;

	async runFixedHelloProbe(): Promise<VercelSandboxCommandResult> {
		this.commandCalls += 1;
		return { ok: true, exitCode: 0, stdout: `${SANDBOX_HELLO_MARKER}\n${revision}\n` };
	}

	async stop(): Promise<VercelSandboxCleanupResult> {
		this.stopCalls += 1;
		return { ok: true };
	}
}

class InMemoryVercelSandboxGateway implements VercelSandboxGateway {
	readonly #session: InMemoryVercelSandboxSession;
	readonly createCalls: CreateVercelGitSandboxOptions[] = [];

	constructor(session: InMemoryVercelSandboxSession) {
		this.#session = session;
	}

	async createGitSandbox(
		options: CreateVercelGitSandboxOptions,
	): Promise<CreateVercelSandboxResult> {
		this.createCalls.push({ ...options, source: { ...options.source } });
		return { ok: true, sandbox: this.#session };
	}
}

function mintedToken(): DispatchTokenMintResult {
	return {
		ok: true,
		value: {
			token: cloneToken,
			expiresAt: "2026-07-13T00:00:00Z",
			repository: "nseng-ai/ns",
			purpose: "clone",
		},
	};
}

function createGateways(options: { readonly mintResult?: DispatchTokenMintResult } = {}): {
	readonly gateways: WorkflowSandboxProbeGateways;
	readonly minter: InMemoryDispatchTokenMinter;
	readonly sandboxes: InMemoryVercelSandboxGateway;
	readonly session: InMemoryVercelSandboxSession;
	readonly minterConfigs: Array<{ githubRepository: string }>;
} {
	const minter = new InMemoryDispatchTokenMinter(options.mintResult ?? mintedToken());
	const session = new InMemoryVercelSandboxSession();
	const sandboxes = new InMemoryVercelSandboxGateway(session);
	const minterConfigs: Array<{ githubRepository: string }> = [];
	return {
		gateways: {
			createDispatchTokenMinter: (config) => {
				minterConfigs.push({ githubRepository: config.githubRepository });
				return minter;
			},
			createSandboxGateway: () => sandboxes,
		},
		minter,
		sandboxes,
		session,
		minterConfigs,
	};
}

describe("runWorkflowSandboxProbe", () => {
	it("mints in-process, injects the token into the clone only, and cleans up", async () => {
		const { gateways, minter, sandboxes, session, minterConfigs } = createGateways();

		const result = await runWorkflowSandboxProbe(
			{ revision, environment: validEnvironment() },
			gateways,
		);

		expect(result).toEqual({
			ok: true,
			repository: "nseng-ai/ns",
			requestedRevision: revision,
			observedSha: revision,
			markerOutput: SANDBOX_HELLO_MARKER,
			sandboxName: "sbx-workflow-probe",
		});
		expect(minterConfigs).toEqual([{ githubRepository: "nseng-ai/ns" }]);
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
		expect(sandboxes.createCalls).toEqual([
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
				credentials: { type: "function-workload-identity" },
			},
		]);
		expect(session.stopCalls).toBe(1);
		// The step result is durable run state: no token material, ever.
		expect(JSON.stringify(result)).not.toContain(cloneToken);
	});

	it("reports a variable-name-only misconfiguration without building gateways", async () => {
		const { gateways, minter, sandboxes } = createGateways();

		const result = await runWorkflowSandboxProbe(
			{
				revision,
				environment: { ...validEnvironment(), NS_DISPATCH_GITHUB_APP_PRIVATE_KEY: "not-a-pem" },
			},
			gateways,
		);

		expect(result).toEqual({
			ok: false,
			code: "probe-misconfigured",
			message: "Sandbox probe configuration is invalid: NS_DISPATCH_GITHUB_APP_PRIVATE_KEY.",
		});
		expect(JSON.stringify(result)).not.toContain("not-a-pem");
		expect(minter.calls).toEqual([]);
		expect(sandboxes.createCalls).toEqual([]);
	});

	it("maps an in-process mint failure to the probe's stable clone failure code", async () => {
		const { gateways, sandboxes, session } = createGateways({
			mintResult: { ok: false, error: { code: "github-token-mint-failed" } },
		});

		const result = await runWorkflowSandboxProbe(
			{ revision, environment: validEnvironment() },
			gateways,
		);

		expect(result).toEqual({
			ok: false,
			code: "clone-token-mint-failed",
			message: "Clone token mint failed.",
		});
		expect(sandboxes.createCalls).toEqual([]);
		expect(session.stopCalls).toBe(0);
	});

	it("rejects a non-commit revision before minting", async () => {
		const { gateways, minter, sandboxes } = createGateways();

		const result = await runWorkflowSandboxProbe(
			{ revision: "main", environment: validEnvironment() },
			gateways,
		);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected probe failure.");
		expect(result.code).toBe("invalid-revision");
		expect(minter.calls).toEqual([]);
		expect(sandboxes.createCalls).toEqual([]);
	});
});

describe("createMinterCloneTokenGateway", () => {
	it("adapts a minted clone token to the probe's clone-token seam", async () => {
		const minter = new InMemoryDispatchTokenMinter(mintedToken());
		const gateway = createMinterCloneTokenGateway(minter);

		const result = await gateway.mintCloneToken({ repository: "nseng-ai/ns" });

		expect(result).toEqual({ ok: true, token: cloneToken });
		expect(minter.calls).toEqual([{ repository: "nseng-ai/ns", purpose: "clone" }]);
	});

	it("normalizes a mint failure without leaking the error detail", async () => {
		const minter = new InMemoryDispatchTokenMinter({
			ok: false,
			error: { code: "repository-not-allowed" },
		});
		const gateway = createMinterCloneTokenGateway(minter);

		expect(await gateway.mintCloneToken({ repository: "other/repo" })).toEqual({ ok: false });
	});
});
