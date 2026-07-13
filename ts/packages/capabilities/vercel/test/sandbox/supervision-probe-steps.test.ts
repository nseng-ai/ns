import { describe, expect, it } from "vitest";

import {
	cleanupSupervisionProbe,
	launchSupervisionProbe,
	pollSupervisionProbe,
} from "../../src/sandbox/supervision-probe-steps.ts";
import {
	SUPERVISION_DONE_MARKER,
	SUPERVISION_PROGRESS_PATH,
	type CreateSupervisionSandboxResult,
	type ReadSupervisionSandboxFileResult,
	type StopSupervisionSandboxResult,
	type SupervisionSandboxGateway,
} from "../../src/sandbox/supervision-probe.ts";

interface InMemoryGatewayState {
	readonly createResult?: CreateSupervisionSandboxResult;
	readonly createThrows?: boolean;
	readonly readResult?: ReadSupervisionSandboxFileResult;
	readonly readThrows?: boolean;
	readonly stopResult?: StopSupervisionSandboxResult;
	readonly stopThrows?: boolean;
}

class InMemorySupervisionSandboxGateway implements SupervisionSandboxGateway {
	readonly #state: InMemoryGatewayState;
	readonly createCalls: Array<{
		runtime: string;
		timeoutMs: number;
		command: { cmd: string; args: readonly string[] };
	}> = [];
	readonly readCalls: Array<{ sandboxName: string; path: string }> = [];
	readonly stopCalls: Array<{ sandboxName: string }> = [];

	constructor(state: InMemoryGatewayState = {}) {
		this.#state = state;
	}

	async createSandboxWithDetachedCommand(options: {
		readonly runtime: "node24";
		readonly timeoutMs: number;
		readonly command: { readonly cmd: string; readonly args: readonly string[] };
	}): Promise<CreateSupervisionSandboxResult> {
		this.createCalls.push({
			runtime: options.runtime,
			timeoutMs: options.timeoutMs,
			command: { cmd: options.command.cmd, args: [...options.command.args] },
		});
		if (this.#state.createThrows === true) throw new Error("create exploded");
		return this.#state.createResult ?? { ok: true, sandboxName: "sbx-supervision" };
	}

	async readSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
	}): Promise<ReadSupervisionSandboxFileResult> {
		this.readCalls.push({ ...options });
		if (this.#state.readThrows === true) throw new Error("read exploded");
		return this.#state.readResult ?? { ok: true, content: null };
	}

	async stopSandbox(options: {
		readonly sandboxName: string;
	}): Promise<StopSupervisionSandboxResult> {
		this.stopCalls.push({ ...options });
		if (this.#state.stopThrows === true) throw new Error("stop exploded");
		return this.#state.stopResult ?? { ok: true };
	}
}

const params = { runSeconds: 840, pollSeconds: 30 };

describe("launchSupervisionProbe", () => {
	it("creates the minimal sandbox with the planned timeout and the detached tick command", async () => {
		const gateway = new InMemorySupervisionSandboxGateway();

		const result = await launchSupervisionProbe(params, gateway);

		expect(result).toEqual({ ok: true, sandboxName: "sbx-supervision" });
		expect(gateway.createCalls).toHaveLength(1);
		const call = gateway.createCalls[0];
		if (call === undefined) throw new Error("Expected a create call.");
		expect(call.runtime).toBe("node24");
		expect(call.timeoutMs).toBe(1_440_000);
		expect(call.command.cmd).toBe("sh");
		expect(call.command.args[1]).toContain(SUPERVISION_DONE_MARKER);
	});

	it("rejects out-of-bounds parameters before touching the gateway", async () => {
		const gateway = new InMemorySupervisionSandboxGateway();

		const result = await launchSupervisionProbe({ runSeconds: 5, pollSeconds: 30 }, gateway);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a validation failure.");
		expect(result.code).toBe("invalid-parameters");
		expect(gateway.createCalls).toEqual([]);
	});

	it("maps a sandbox creation failure to launch-failed", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({ createResult: { ok: false } });

		const result = await launchSupervisionProbe(params, gateway);

		expect(result).toEqual({ ok: false, code: "launch-failed", message: "Sandbox launch failed." });
	});

	it("maps a sandbox creation throw to launch-failed", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({ createThrows: true });

		const result = await launchSupervisionProbe(params, gateway);

		expect(result).toEqual({ ok: false, code: "launch-failed", message: "Sandbox launch failed." });
	});

	it("refuses a sandbox name later steps could not safely journal or reattach to", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({
			createResult: { ok: true, sandboxName: "bad name!" },
		});

		const result = await launchSupervisionProbe(params, gateway);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a launch failure.");
		expect(result.code).toBe("launch-failed");
	});
});

describe("pollSupervisionProbe", () => {
	it("reads the progress file and reports a still-running tick count", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({
			readResult: { ok: true, content: "tick 1\ntick 2\n" },
		});

		const result = await pollSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway);

		expect(result).toEqual({ ok: true, phase: "running", ticks: 2 });
		expect(gateway.readCalls).toEqual([
			{ sandboxName: "sbx-supervision", path: SUPERVISION_PROGRESS_PATH },
		]);
	});

	it("reports done once the marker line lands", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({
			readResult: { ok: true, content: `tick 1\n${SUPERVISION_DONE_MARKER}\n` },
		});

		expect(await pollSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway)).toEqual({
			ok: true,
			phase: "done",
			ticks: 1,
		});
	});

	it("treats a not-yet-created progress file as running with zero ticks", async () => {
		const gateway = new InMemorySupervisionSandboxGateway({
			readResult: { ok: true, content: null },
		});

		expect(await pollSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway)).toEqual({
			ok: true,
			phase: "running",
			ticks: 0,
		});
	});

	it.each([
		["a gateway failure", { readResult: { ok: false } as const }],
		["a gateway throw", { readThrows: true }],
	])("maps %s to poll-failed", async (_label, state) => {
		const gateway = new InMemorySupervisionSandboxGateway(state);

		expect(await pollSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway)).toEqual({
			ok: false,
			code: "poll-failed",
			message: "Supervision progress read failed.",
		});
	});
});

describe("cleanupSupervisionProbe", () => {
	it("stops the sandbox by name", async () => {
		const gateway = new InMemorySupervisionSandboxGateway();

		const result = await cleanupSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway);

		expect(result).toEqual({ ok: true });
		expect(gateway.stopCalls).toEqual([{ sandboxName: "sbx-supervision" }]);
	});

	it.each([
		["a gateway failure", { stopResult: { ok: false } as const }],
		["a gateway throw", { stopThrows: true }],
	])("maps %s to sandbox-cleanup-failed", async (_label, state) => {
		const gateway = new InMemorySupervisionSandboxGateway(state);

		expect(await cleanupSupervisionProbe({ sandboxName: "sbx-supervision" }, gateway)).toEqual({
			ok: false,
			code: "sandbox-cleanup-failed",
			message: "Sandbox cleanup failed.",
		});
	});
});
