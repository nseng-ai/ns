import { describe, expect, it } from "vitest";

import {
	createRealSupervisionSandboxGateway,
	type SupervisionSandboxSdk,
	type SupervisionSandboxSdkSandbox,
} from "../../src/sandbox/real-supervision-sandbox-gateway.ts";

interface RecordingSandboxState {
	readonly name?: string;
	readonly status?: string;
	readonly fileContent?: string | null;
	readonly shouldThrowOnDetachedCommand?: boolean;
	readonly shouldThrowOnStop?: boolean;
}

class RecordingSdkSandbox implements SupervisionSandboxSdkSandbox {
	readonly name: string;
	readonly status: string;
	readonly #state: RecordingSandboxState;
	readonly detachedCalls: Array<{ cmd: string; args: readonly string[] }> = [];
	readonly readCalls: Array<{ path: string }> = [];
	stopCalls = 0;

	constructor(state: RecordingSandboxState = {}) {
		this.#state = state;
		this.name = state.name ?? "sbx-supervision";
		this.status = state.status ?? "running";
	}

	async runDetachedCommand(options: {
		readonly cmd: string;
		readonly args: readonly string[];
	}): Promise<unknown> {
		this.detachedCalls.push({ cmd: options.cmd, args: [...options.args] });
		if (this.#state.shouldThrowOnDetachedCommand === true)
			throw new Error("detached launch exploded");
		return {};
	}

	async readFileToBuffer(options: { readonly path: string }): Promise<Buffer | null> {
		this.readCalls.push({ ...options });
		const content = this.#state.fileContent;
		return content === null || content === undefined ? null : Buffer.from(content, "utf8");
	}

	async stop(): Promise<unknown> {
		this.stopCalls += 1;
		if (this.#state.shouldThrowOnStop === true) throw new Error("stop exploded");
		return {};
	}
}

class RecordingSupervisionSandboxSdk implements SupervisionSandboxSdk {
	readonly #sandbox: RecordingSdkSandbox;
	readonly #shouldThrowOnCreate: boolean;
	readonly #shouldThrowOnGet: boolean;
	readonly createCalls: Array<{ runtime: string; timeout: number }> = [];
	readonly getCalls: Array<{ name: string; resume: false }> = [];

	constructor(
		sandbox: RecordingSdkSandbox,
		options: {
			readonly shouldThrowOnCreate?: boolean;
			readonly shouldThrowOnGet?: boolean;
		} = {},
	) {
		this.#sandbox = sandbox;
		this.#shouldThrowOnCreate = options.shouldThrowOnCreate ?? false;
		this.#shouldThrowOnGet = options.shouldThrowOnGet ?? false;
	}

	async create(options: {
		readonly runtime: "node24";
		readonly timeout: number;
	}): Promise<SupervisionSandboxSdkSandbox> {
		this.createCalls.push({ ...options });
		if (this.#shouldThrowOnCreate) throw new Error("create exploded");
		return this.#sandbox;
	}

	async get(options: {
		readonly name: string;
		readonly resume: false;
	}): Promise<SupervisionSandboxSdkSandbox> {
		this.getCalls.push({ ...options });
		if (this.#shouldThrowOnGet) throw new Error("get exploded");
		return this.#sandbox;
	}
}

const command = { cmd: "sh", args: ["-c", "echo tick"] };

describe("createRealSupervisionSandboxGateway", () => {
	it("creates a minimal credential-free sandbox and launches the detached command", async () => {
		const sandbox = new RecordingSdkSandbox();
		const sdk = new RecordingSupervisionSandboxSdk(sandbox);
		const gateway = createRealSupervisionSandboxGateway(sdk);

		const result = await gateway.createSandbox({ runtime: "node24", timeoutMs: 1_440_000 });
		const detached = await gateway.runDetachedSandboxCommand({
			sandboxName: "sbx-supervision",
			command,
		});

		expect(result).toEqual({ ok: true, sandboxName: "sbx-supervision" });
		expect(detached).toEqual({ ok: true });
		expect(sdk.createCalls).toEqual([{ runtime: "node24", timeout: 1_440_000 }]);
		expect(sandbox.detachedCalls).toEqual([{ cmd: "sh", args: ["-c", "echo tick"] }]);
		expect(sandbox.stopCalls).toBe(0);
	});

	it("normalizes a creation throw to a safe failure", async () => {
		const sdk = new RecordingSupervisionSandboxSdk(new RecordingSdkSandbox(), {
			shouldThrowOnCreate: true,
		});
		const gateway = createRealSupervisionSandboxGateway(sdk);

		await expect(
			gateway.createSandbox({ runtime: "node24", timeoutMs: 1_440_000 }),
		).rejects.toThrow("create exploded");
	});

	it("stops the created sandbox when the detached launch fails, rather than leaking it", async () => {
		const sandbox = new RecordingSdkSandbox({ shouldThrowOnDetachedCommand: true });
		const gateway = createRealSupervisionSandboxGateway(
			new RecordingSupervisionSandboxSdk(sandbox),
		);

		await expect(
			gateway.runDetachedSandboxCommand({ sandboxName: "sbx-supervision", command }),
		).rejects.toThrow("detached launch exploded");
		expect(sandbox.stopCalls).toBe(0);
	});

	it("reattaches by name without resuming and reads the progress file", async () => {
		const sandbox = new RecordingSdkSandbox({ fileContent: "tick 1\n" });
		const sdk = new RecordingSupervisionSandboxSdk(sandbox);
		const gateway = createRealSupervisionSandboxGateway(sdk);

		const result = await gateway.readSandboxFile({
			sandboxName: "sbx-supervision",
			path: "/tmp/progress.log",
		});

		expect(result).toEqual({ ok: true, content: "tick 1\n" });
		expect(sdk.getCalls).toEqual([{ name: "sbx-supervision", resume: false }]);
		expect(sandbox.readCalls).toEqual([{ path: "/tmp/progress.log" }]);
	});

	it("reports a missing file as null content rather than a failure", async () => {
		const gateway = createRealSupervisionSandboxGateway(
			new RecordingSupervisionSandboxSdk(new RecordingSdkSandbox({ fileContent: null })),
		);

		expect(
			await gateway.readSandboxFile({ sandboxName: "sbx-supervision", path: "/tmp/progress.log" }),
		).toEqual({ ok: true, content: null });
	});

	it("lets a read throw reach the owning poll step", async () => {
		const gateway = createRealSupervisionSandboxGateway(
			new RecordingSupervisionSandboxSdk(new RecordingSdkSandbox(), { shouldThrowOnGet: true }),
		);

		await expect(
			gateway.readSandboxFile({ sandboxName: "sbx-supervision", path: "/tmp/progress.log" }),
		).rejects.toThrow("get exploded");
	});

	it("stops a running sandbox on cleanup", async () => {
		const sandbox = new RecordingSdkSandbox({ status: "running" });
		const gateway = createRealSupervisionSandboxGateway(
			new RecordingSupervisionSandboxSdk(sandbox),
		);

		expect(await gateway.stopSandbox({ sandboxName: "sbx-supervision" })).toEqual({ ok: true });
		expect(sandbox.stopCalls).toBe(1);
	});

	it.each([["stopped"], ["stopping"]])(
		"treats an already-%s sandbox as cleaned without another stop call",
		async (status) => {
			const sandbox = new RecordingSdkSandbox({ status });
			const gateway = createRealSupervisionSandboxGateway(
				new RecordingSupervisionSandboxSdk(sandbox),
			);

			expect(await gateway.stopSandbox({ sandboxName: "sbx-supervision" })).toEqual({ ok: true });
			expect(sandbox.stopCalls).toBe(0);
		},
	);

	it("lets a stop throw reach the owning cleanup step", async () => {
		const gateway = createRealSupervisionSandboxGateway(
			new RecordingSupervisionSandboxSdk(new RecordingSdkSandbox({ shouldThrowOnStop: true })),
		);

		await expect(gateway.stopSandbox({ sandboxName: "sbx-supervision" })).rejects.toThrow(
			"stop exploded",
		);
	});
});
