// The real @vercel/sandbox adapter behind DispatchSandboxGateway: probe-3's
// supervisor shape (the launch step holds the only live handle; later steps
// reattach by sandbox name via `Sandbox.get`) over probe-2's private-git
// source shape (shallow checkout of the exact dispatched SHA with the clone
// token injected at creation). No explicit Sandbox API credentials anywhere:
// `Sandbox.create`/`Sandbox.get` resolve the deployed Function's own OIDC
// workload identity ambiently. Command results deliberately carry no argv,
// env, or output — the landing command's environment holds a token. Live
// behavior on Vercel is pending verification. `sdk` is the test seam;
// production callers use the default binding.
import { Sandbox } from "@vercel/sandbox";

import type { DispatchSandboxGateway } from "./dispatch-run.ts";

export interface DispatchSandboxSdkSandbox {
	readonly name: string;
	readonly status: string;
	runCommand(options: {
		readonly cmd: string;
		readonly args: readonly string[];
		readonly env?: Readonly<Record<string, string>>;
	}): Promise<{ readonly exitCode: number }>;
	runDetachedCommand(options: {
		readonly cmd: string;
		readonly args: readonly string[];
		readonly env?: Readonly<Record<string, string>>;
	}): Promise<unknown>;
	readFileToBuffer(options: { readonly path: string }): Promise<Buffer | null>;
	writeFiles(files: readonly { readonly path: string; readonly content: string }[]): Promise<void>;
	stop(): Promise<unknown>;
}

export interface DispatchSandboxSdk {
	create(options: {
		readonly runtime: "node24";
		readonly timeout: number;
		readonly source: {
			readonly type: "git";
			readonly url: string;
			readonly username: "x-access-token";
			readonly password: string;
			readonly depth: 1;
			readonly revision: string;
		};
	}): Promise<DispatchSandboxSdkSandbox>;
	/**
	 * Reattach to an existing sandbox by name. `resume` is always `false`:
	 * every post-launch operation observes the sandbox as it is and must
	 * never restart a stopped one.
	 */
	get(options: {
		readonly name: string;
		readonly resume: false;
	}): Promise<DispatchSandboxSdkSandbox>;
}

const dispatchSandboxSdk: DispatchSandboxSdk = {
	async create(options) {
		return wrapSandbox(
			await Sandbox.create({
				runtime: options.runtime,
				timeout: options.timeout,
				source: {
					type: options.source.type,
					url: options.source.url,
					username: options.source.username,
					password: options.source.password,
					depth: options.source.depth,
					revision: options.source.revision,
				},
			}),
		);
	},
	async get(options) {
		return wrapSandbox(await Sandbox.get({ name: options.name, resume: options.resume }));
	},
};

function wrapSandbox(sandbox: Sandbox): DispatchSandboxSdkSandbox {
	return {
		name: sandbox.name,
		status: sandbox.status,
		async runCommand(options) {
			const command = await sandbox.runCommand({
				cmd: options.cmd,
				args: [...options.args],
				...(options.env === undefined ? {} : { env: { ...options.env } }),
			});
			return { exitCode: command.exitCode };
		},
		async runDetachedCommand(options) {
			return await sandbox.runCommand({
				cmd: options.cmd,
				args: [...options.args],
				...(options.env === undefined ? {} : { env: { ...options.env } }),
				detached: true,
			});
		},
		async readFileToBuffer(options) {
			return await sandbox.readFileToBuffer({ path: options.path });
		},
		async writeFiles(files) {
			await sandbox.writeFiles(files.map((file) => ({ ...file })));
		},
		async stop() {
			return await sandbox.stop();
		},
	};
}

export function createRealDispatchSandboxGateway(
	sdk: DispatchSandboxSdk = dispatchSandboxSdk,
): DispatchSandboxGateway {
	return {
		async createDispatchSandbox(options) {
			try {
				const sandbox = await sdk.create({
					runtime: options.runtime,
					timeout: options.timeoutMs,
					source: {
						type: "git",
						url: `https://github.com/${options.source.repository}.git`,
						username: "x-access-token",
						password: options.source.cloneToken,
						depth: 1,
						revision: options.source.revision,
					},
				});
				return { ok: true, sandboxName: sandbox.name };
			} catch {
				return { ok: false };
			}
		},
		async writeSandboxFile(options) {
			try {
				const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
				await sandbox.writeFiles([{ path: options.path, content: options.content }]);
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
		async runSandboxCommand(options) {
			try {
				const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
				const command = await sandbox.runCommand({
					cmd: options.command.cmd,
					args: options.command.args,
					...(options.env === undefined ? {} : { env: options.env }),
				});
				return { ok: true, exitCode: command.exitCode };
			} catch {
				return { ok: false };
			}
		},
		async runDetachedSandboxCommand(options) {
			try {
				const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
				await sandbox.runDetachedCommand({
					cmd: options.command.cmd,
					args: options.command.args,
					...(options.env === undefined ? {} : { env: options.env }),
				});
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
		async readSandboxFile(options) {
			try {
				const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
				const buffer = await sandbox.readFileToBuffer({ path: options.path });
				return { ok: true, content: buffer === null ? null : buffer.toString("utf8") };
			} catch {
				return { ok: false };
			}
		},
		async stopSandbox(options) {
			try {
				const sandbox = await sdk.get({ name: options.sandboxName, resume: false });
				// Already terminated (or terminating): cleanup is done, so a
				// re-run of the cleanup step succeeds without another stop call.
				if (sandbox.status === "stopped" || sandbox.status === "stopping") {
					return { ok: true };
				}
				await sandbox.stop();
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},
	};
}
