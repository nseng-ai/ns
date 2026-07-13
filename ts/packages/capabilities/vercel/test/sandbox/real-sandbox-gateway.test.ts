import { describe, expect, it } from "vitest";

import {
	SANDBOX_HELLO_COMMAND,
	type CreateVercelGitSandboxOptions,
} from "../../src/sandbox/hello-probe.ts";
import {
	createRealVercelSandboxGateway,
	type VercelSandboxSdk,
	type VercelSandboxSdkCreateOptions,
	type VercelSandboxSdkSession,
} from "../../src/sandbox/real-sandbox-gateway.ts";

const revision = "0123456789abcdef0123456789abcdef01234567";

class RecordingVercelSandboxSdk implements VercelSandboxSdk {
	readonly #session: VercelSandboxSdkSession;
	readonly createCalls: VercelSandboxSdkCreateOptions[] = [];

	constructor(session: VercelSandboxSdkSession) {
		this.#session = session;
	}

	async create(options: VercelSandboxSdkCreateOptions): Promise<VercelSandboxSdkSession> {
		this.createCalls.push({ ...options, source: { ...options.source } });
		return this.#session;
	}
}

class RecordingVercelSandboxSdkSession implements VercelSandboxSdkSession {
	readonly name = "sbx-real-adapter";
	readonly commandCalls: Array<{ cmd: string; args: readonly string[] }> = [];
	stopCalls = 0;

	async runCommand(options: { readonly cmd: string; readonly args: readonly string[] }) {
		this.commandCalls.push({ cmd: options.cmd, args: [...options.args] });
		return {
			exitCode: 0,
			stdout: async () => "probe output",
		};
	}

	async stop(): Promise<void> {
		this.stopCalls += 1;
	}
}

function createOptions(): CreateVercelGitSandboxOptions {
	return {
		runtime: "node24",
		persistent: false,
		timeoutMs: 120_000,
		source: {
			type: "git",
			url: "https://github.com/nseng-ai/ns.git",
			username: "x-access-token",
			password: "minted-clone-token",
			depth: 1,
			revision,
		},
		credentials: {
			type: "explicit-oidc-token",
			oidcToken: "development-oidc-token",
			projectId: "prj_dispatch",
			teamId: "team_dispatch",
		},
	};
}

describe("createRealVercelSandboxGateway", () => {
	it("maps explicit git checkout and development credentials into Sandbox.create", async () => {
		const sdkSession = new RecordingVercelSandboxSdkSession();
		const sdk = new RecordingVercelSandboxSdk(sdkSession);
		const gateway = createRealVercelSandboxGateway(sdk);

		const createResult = await gateway.createGitSandbox(createOptions());

		expect(sdk.createCalls).toEqual([
			{
				runtime: "node24",
				persistent: false,
				timeout: 120_000,
				source: {
					type: "git",
					url: "https://github.com/nseng-ai/ns.git",
					username: "x-access-token",
					password: "minted-clone-token",
					depth: 1,
					revision,
				},
				credentials: {
					token: "development-oidc-token",
					projectId: "prj_dispatch",
					teamId: "team_dispatch",
				},
			},
		]);
		expect(createResult.ok).toBe(true);
		if (!createResult.ok) throw new Error("Expected Sandbox creation success.");

		const commandResult = await createResult.sandbox.runFixedHelloProbe();
		const cleanupResult = await createResult.sandbox.stop();

		expect(commandResult).toEqual({ ok: true, exitCode: 0, stdout: "probe output" });
		expect(sdkSession.commandCalls).toEqual([
			{ cmd: SANDBOX_HELLO_COMMAND.cmd, args: SANDBOX_HELLO_COMMAND.args },
		]);
		expect(cleanupResult).toEqual({ ok: true });
		expect(sdkSession.stopCalls).toBe(1);
	});

	it("omits explicit credentials for the function-workload-identity source", async () => {
		const sdk = new RecordingVercelSandboxSdk(new RecordingVercelSandboxSdkSession());
		const gateway = createRealVercelSandboxGateway(sdk);

		const createResult = await gateway.createGitSandbox({
			...createOptions(),
			credentials: { type: "function-workload-identity" },
		});

		expect(createResult.ok).toBe(true);
		expect(sdk.createCalls).toHaveLength(1);
		expect(sdk.createCalls[0]).not.toHaveProperty("credentials");
	});
});
