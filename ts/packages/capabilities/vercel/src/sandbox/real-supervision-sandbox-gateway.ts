// The real @vercel/sandbox adapter behind SupervisionSandboxGateway
// (probe-3, long-run supervision). This is the Workflow SDK sandbox
// cookbook's supervisor shape: the launch step holds the only live handle
// (create + detached command), later steps reattach by sandbox name via
// `Sandbox.get`. No explicit credentials anywhere — the probe's sandbox
// needs no repo checkout, and `Sandbox.create`/`Sandbox.get` resolve the
// deployed Function's own OIDC workload identity ambiently. Live reattach,
// detached-command, and stop behavior on Vercel are pending verification.
// `sdk` is the test seam; production callers use the default binding. SDK
// throws intentionally cross this adapter and are normalized only by the
// owning workflow step function.
import { Sandbox } from "@vercel/sandbox";

import type { SupervisionSandboxGateway } from "./supervision-probe.ts";

export interface SupervisionSandboxSdkSandbox {
	readonly name: string;
	readonly status: string;
	runDetachedCommand(options: {
		readonly cmd: string;
		readonly args: readonly string[];
	}): Promise<unknown>;
	readFileToBuffer(options: { readonly path: string }): Promise<Buffer | null>;
	stop(): Promise<unknown>;
}

export interface SupervisionSandboxSdk {
	create(options: {
		readonly runtime: "node24";
		readonly timeout: number;
	}): Promise<SupervisionSandboxSdkSandbox>;
	/**
	 * Reattach to an existing sandbox by name. `resume` is always `false`:
	 * poll and cleanup observe the sandbox as it is and must never restart a
	 * stopped one.
	 */
	get(options: {
		readonly name: string;
		readonly resume: false;
	}): Promise<SupervisionSandboxSdkSandbox>;
}

const supervisionSandboxSdk: SupervisionSandboxSdk = {
	async create(options) {
		return wrapSandbox(
			await Sandbox.create({ runtime: options.runtime, timeout: options.timeout }),
		);
	},
	async get(options) {
		return wrapSandbox(await Sandbox.get({ name: options.name, resume: options.resume }));
	},
};

function wrapSandbox(sandbox: Sandbox): SupervisionSandboxSdkSandbox {
	return {
		name: sandbox.name,
		status: sandbox.status,
		async runDetachedCommand(options) {
			return await sandbox.runCommand({
				cmd: options.cmd,
				args: [...options.args],
				detached: true,
			});
		},
		async readFileToBuffer(options) {
			return await sandbox.readFileToBuffer({ path: options.path });
		},
		async stop() {
			return await sandbox.stop();
		},
	};
}

export function createRealSupervisionSandboxGateway(
	sdk: SupervisionSandboxSdk = supervisionSandboxSdk,
): SupervisionSandboxGateway {
	return {
		async createSandbox(options) {
			const sandbox = await sdk.create({ runtime: options.runtime, timeout: options.timeoutMs });
			return { ok: true, sandboxName: sandbox.name };
		},
		async runDetachedSandboxCommand(options) {
			const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
			await sandbox.runDetachedCommand(options.command);
			return { ok: true };
		},
		async readSandboxFile(options) {
			const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
			const buffer = await sandbox.readFileToBuffer({ path: options.path });
			return { ok: true, content: buffer === null ? null : buffer.toString("utf8") };
		},
		async stopSandbox(options) {
			const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
			// Already terminated (or terminating): cleanup is done, so a
			// re-run of the cleanup step succeeds without another stop call.
			if (sandbox.status === "stopped" || sandbox.status === "stopping") {
				return { ok: true };
			}
			await sandbox.stop();
			return { ok: true };
		},
	};
}
