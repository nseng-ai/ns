import type { DispatchSandboxGateway } from "../../../src/dispatch/dispatch-run.ts";
import type { SandboxCommand } from "../../../src/sandbox/contracts.ts";

export interface DispatchSandboxCall {
	readonly method: string;
	readonly options: Record<string, unknown>;
}

export interface DispatchSandboxBehavior {
	readonly createFails?: boolean;
	readonly createThrows?: boolean;
	readonly createdName?: string;
	readonly writeFails?: boolean;
	readonly writeThrows?: boolean;
	readonly commandExitCode?: number;
	readonly commandFails?: boolean;
	readonly commandThrows?: boolean;
	readonly detachedFails?: boolean;
	readonly detachedThrows?: boolean;
	readonly readFails?: boolean;
	readonly readThrows?: boolean;
	readonly readFailurePaths?: readonly string[];
	readonly files?: Readonly<Record<string, string>>;
	readonly stopFails?: boolean;
	readonly stopThrows?: boolean;
}

/** Recording fake whose attempts are visible even when an operation throws. */
export class RecordingDispatchSandboxGateway implements DispatchSandboxGateway {
	readonly #behavior: DispatchSandboxBehavior;
	readonly calls: DispatchSandboxCall[] = [];

	constructor(behavior: DispatchSandboxBehavior = {}) {
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
		if (this.#behavior.createThrows === true) throw new Error("create exploded");
		if (this.#behavior.createFails === true) return { ok: false } as const;
		return { ok: true, sandboxName: this.#behavior.createdName ?? "sbx_dispatch" } as const;
	}

	async writeSandboxFile(options: {
		readonly sandboxName: string;
		readonly path: string;
		readonly content: string;
	}) {
		this.calls.push({ method: "write", options: { ...options } });
		if (this.#behavior.writeThrows === true) throw new Error("write exploded");
		return this.#behavior.writeFails === true ? ({ ok: false } as const) : ({ ok: true } as const);
	}

	async runSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: SandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}) {
		this.calls.push({ method: "run", options: { ...options } });
		if (this.#behavior.commandThrows === true) throw new Error("command exploded");
		if (this.#behavior.commandFails === true) return { ok: false } as const;
		return { ok: true, exitCode: this.#behavior.commandExitCode ?? 0 } as const;
	}

	async runDetachedSandboxCommand(options: {
		readonly sandboxName: string;
		readonly command: SandboxCommand;
		readonly env?: Readonly<Record<string, string>>;
	}) {
		this.calls.push({ method: "runDetached", options: { ...options } });
		if (this.#behavior.detachedThrows === true) throw new Error("detached exploded");
		return this.#behavior.detachedFails === true
			? ({ ok: false } as const)
			: ({ ok: true } as const);
	}

	async readSandboxFile(options: { readonly sandboxName: string; readonly path: string }) {
		this.calls.push({ method: "read", options: { ...options } });
		if (this.#behavior.readThrows === true) throw new Error("read exploded");
		if (
			this.#behavior.readFails === true ||
			this.#behavior.readFailurePaths?.includes(options.path) === true
		) {
			return { ok: false } as const;
		}
		return { ok: true, content: this.#behavior.files?.[options.path] ?? null } as const;
	}

	async stopSandbox(options: { readonly sandboxName: string }) {
		this.calls.push({ method: "stop", options: { ...options } });
		if (this.#behavior.stopThrows === true) throw new Error("stop exploded");
		return this.#behavior.stopFails === true ? ({ ok: false } as const) : ({ ok: true } as const);
	}
}
