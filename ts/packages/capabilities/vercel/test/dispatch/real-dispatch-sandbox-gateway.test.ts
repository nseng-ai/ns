import { describe, expect, it } from "vitest";

import {
	createRealDispatchSandboxGateway,
	type DispatchSandboxSdk,
	type DispatchSandboxSdkSandbox,
} from "../../src/dispatch/real-dispatch-sandbox-gateway.ts";

interface SdkCall {
	readonly method: string;
	readonly options: unknown;
}

interface FakeSdkBehavior {
	readonly createError?: Error;
	readonly getError?: Error;
	readonly commandError?: Error;
	readonly status?: string;
	readonly exitCode?: number;
	readonly fileContent?: string | null;
}

function createFakeSdk(behavior: FakeSdkBehavior = {}): {
	readonly sdk: DispatchSandboxSdk;
	readonly calls: SdkCall[];
} {
	const calls: SdkCall[] = [];

	function sandbox(name: string): DispatchSandboxSdkSandbox {
		return {
			name,
			status: behavior.status ?? "running",
			async runCommand(options) {
				calls.push({ method: "runCommand", options: { ...options } });
				if (behavior.commandError !== undefined) throw behavior.commandError;
				return { exitCode: behavior.exitCode ?? 0 };
			},
			async runDetachedCommand(options) {
				calls.push({ method: "runDetachedCommand", options: { ...options } });
				if (behavior.commandError !== undefined) throw behavior.commandError;
				return {};
			},
			async readFileToBuffer(options) {
				calls.push({ method: "readFileToBuffer", options: { ...options } });
				const content = behavior.fileContent;
				return content === undefined || content === null ? null : Buffer.from(content, "utf8");
			},
			async writeFiles(files) {
				calls.push({ method: "writeFiles", options: files.map((file) => ({ ...file })) });
			},
			async stop() {
				calls.push({ method: "stop", options: { name } });
				return {};
			},
		};
	}

	const sdk: DispatchSandboxSdk = {
		async create(options) {
			calls.push({ method: "create", options: { ...options, source: { ...options.source } } });
			if (behavior.createError !== undefined) throw behavior.createError;
			return sandbox("sbx_real");
		},
		async get(options) {
			calls.push({ method: "get", options: { ...options } });
			if (behavior.getError !== undefined) throw behavior.getError;
			return sandbox(options.name);
		},
	};
	return { sdk, calls };
}

describe("createRealDispatchSandboxGateway", () => {
	it("creates the sandbox over the private git source at the exact SHA with the clone token", async () => {
		const { sdk, calls } = createFakeSdk();
		const gateway = createRealDispatchSandboxGateway(sdk);

		const result = await gateway.createDispatchSandbox({
			runtime: "node24",
			timeoutMs: 16_200_000,
			source: {
				repository: "nseng-ai/ns",
				revision: "0123456789abcdef0123456789abcdef01234567",
				cloneToken: "clone-token-fixture",
			},
		});

		expect(result).toEqual({ ok: true, sandboxName: "sbx_real" });
		expect(calls).toEqual([
			{
				method: "create",
				options: {
					runtime: "node24",
					timeout: 16_200_000,
					source: {
						type: "git",
						url: "https://github.com/nseng-ai/ns.git",
						username: "x-access-token",
						password: "clone-token-fixture",
						depth: 1,
						revision: "0123456789abcdef0123456789abcdef01234567",
					},
				},
			},
		]);
	});

	it("lets a create throw reach the owning step boundary", async () => {
		const { sdk } = createFakeSdk({ createError: new Error("quota") });
		const gateway = createRealDispatchSandboxGateway(sdk);

		await expect(
			gateway.createDispatchSandbox({
				runtime: "node24",
				timeoutMs: 1000,
				source: { repository: "nseng-ai/ns", revision: "a".repeat(40), cloneToken: "t" },
			}),
		).rejects.toThrow("quota");
	});

	it("reattaches by name without resuming to write files", async () => {
		const { sdk, calls } = createFakeSdk();
		const gateway = createRealDispatchSandboxGateway(sdk);

		const result = await gateway.writeSandboxFile({
			sandboxName: "sbx_real",
			path: "/tmp/ns-dispatch/prompt.md",
			content: "prompt",
		});

		expect(result).toEqual({ ok: true });
		expect(calls[0]).toEqual({ method: "get", options: { name: "sbx_real", resume: false } });
		expect(calls[1]).toEqual({
			method: "writeFiles",
			options: [{ path: "/tmp/ns-dispatch/prompt.md", content: "prompt" }],
		});
	});

	it("runs a blocking command with a per-command environment and returns only the exit code", async () => {
		const { sdk, calls } = createFakeSdk({ exitCode: 3 });
		const gateway = createRealDispatchSandboxGateway(sdk);

		const result = await gateway.runSandboxCommand({
			sandboxName: "sbx_real",
			command: { cmd: "sh", args: ["-c", "true"] },
			env: { NS_DISPATCH_LANDING_TOKEN: "landing-token-fixture" },
		});

		expect(result).toEqual({ ok: true, exitCode: 3 });
		expect(calls[1]).toEqual({
			method: "runCommand",
			options: {
				cmd: "sh",
				args: ["-c", "true"],
				env: { NS_DISPATCH_LANDING_TOKEN: "landing-token-fixture" },
			},
		});
	});

	it("launches the detached command with its environment", async () => {
		const { sdk, calls } = createFakeSdk();
		const gateway = createRealDispatchSandboxGateway(sdk);

		const result = await gateway.runDetachedSandboxCommand({
			sandboxName: "sbx_real",
			command: { cmd: "fake-harness", args: ["--headless"] },
			env: { ANTHROPIC_API_KEY: "model-key" },
		});

		expect(result).toEqual({ ok: true });
		expect(calls[1]).toEqual({
			method: "runDetachedCommand",
			options: {
				cmd: "fake-harness",
				args: ["--headless"],
				env: { ANTHROPIC_API_KEY: "model-key" },
			},
		});
	});

	it("reads a file back as utf8 and a missing file as null", async () => {
		const withContent = createRealDispatchSandboxGateway(
			createFakeSdk({ fileContent: '{"outcome":"completed"}' }).sdk,
		);
		const withoutContent = createRealDispatchSandboxGateway(createFakeSdk().sdk);

		expect(await withContent.readSandboxFile({ sandboxName: "sbx_real", path: "/tmp/x" })).toEqual({
			ok: true,
			content: '{"outcome":"completed"}',
		});
		expect(
			await withoutContent.readSandboxFile({ sandboxName: "sbx_real", path: "/tmp/x" }),
		).toEqual({ ok: true, content: null });
	});

	it("treats an already-stopped sandbox as cleaned without another stop call", async () => {
		const { sdk, calls } = createFakeSdk({ status: "stopped" });
		const gateway = createRealDispatchSandboxGateway(sdk);

		const result = await gateway.stopSandbox({ sandboxName: "sbx_real" });

		expect(result).toEqual({ ok: true });
		expect(calls.map((call) => call.method)).toEqual(["get"]);
	});

	it("stops a running sandbox and lets reattach failures reach the owning step", async () => {
		const running = createFakeSdk();
		const gateway = createRealDispatchSandboxGateway(running.sdk);

		expect(await gateway.stopSandbox({ sandboxName: "sbx_real" })).toEqual({ ok: true });
		expect(running.calls.map((call) => call.method)).toEqual(["get", "stop"]);

		const broken = createRealDispatchSandboxGateway(
			createFakeSdk({ getError: new Error("gone") }).sdk,
		);
		await expect(broken.stopSandbox({ sandboxName: "sbx_real" })).rejects.toThrow("gone");
	});
});
