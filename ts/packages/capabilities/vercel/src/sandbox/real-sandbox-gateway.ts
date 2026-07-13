import { Sandbox } from "@vercel/sandbox";

import {
	SANDBOX_HELLO_COMMAND,
	type CreateVercelGitSandboxOptions,
	type CreateVercelSandboxResult,
	type VercelSandboxCommandResult,
	type VercelSandboxGateway,
	type VercelSandboxSession,
} from "./hello-probe.ts";

export interface VercelSandboxSdkCreateOptions {
	readonly runtime: "node24";
	readonly persistent: false;
	readonly timeout: number;
	readonly source: {
		readonly type: "git";
		readonly url: string;
		readonly username: "x-access-token";
		readonly password: string;
		readonly depth: 1;
		readonly revision: string;
	};
	/**
	 * Explicit Sandbox API credentials. Omitted for the
	 * `function-workload-identity` source, where `Sandbox.create` resolves the
	 * deployed Function's own OIDC identity ambiently.
	 */
	readonly credentials?: {
		readonly token: string;
		readonly projectId: string;
		readonly teamId: string;
	};
}

export interface VercelSandboxSdkCommand {
	readonly exitCode: number;
	stdout(): Promise<string>;
}

export interface VercelSandboxSdkSession {
	readonly name: string;
	runCommand(options: {
		readonly cmd: string;
		readonly args: readonly string[];
	}): Promise<VercelSandboxSdkCommand>;
	stop(): Promise<unknown>;
}

export interface VercelSandboxSdk {
	create(options: VercelSandboxSdkCreateOptions): Promise<VercelSandboxSdkSession>;
}

const vercelSandboxSdk: VercelSandboxSdk = {
	async create(options) {
		const sandbox = await Sandbox.create({
			runtime: options.runtime,
			persistent: options.persistent,
			timeout: options.timeout,
			source: {
				type: options.source.type,
				url: options.source.url,
				username: options.source.username,
				password: options.source.password,
				depth: options.source.depth,
				revision: options.source.revision,
			},
			...(options.credentials === undefined
				? {}
				: {
						token: options.credentials.token,
						projectId: options.credentials.projectId,
						teamId: options.credentials.teamId,
					}),
		});
		return {
			name: sandbox.name,
			async runCommand(commandOptions) {
				return sandbox.runCommand({
					cmd: commandOptions.cmd,
					args: [...commandOptions.args],
				});
			},
			async stop() {
				return sandbox.stop();
			},
		};
	},
};

export function createRealVercelSandboxGateway(
	sdk: VercelSandboxSdk = vercelSandboxSdk,
): VercelSandboxGateway {
	return {
		async createGitSandbox(
			options: CreateVercelGitSandboxOptions,
		): Promise<CreateVercelSandboxResult> {
			try {
				const credentials = options.credentials;
				const sandbox = await sdk.create({
					runtime: options.runtime,
					persistent: options.persistent,
					timeout: options.timeoutMs,
					source: { ...options.source },
					...(credentials.type === "explicit-oidc-token"
						? {
								credentials: {
									token: credentials.oidcToken,
									projectId: credentials.projectId,
									teamId: credentials.teamId,
								},
							}
						: {}),
				});
				return { ok: true, sandbox: new RealVercelSandboxSession(sandbox) };
			} catch {
				return { ok: false };
			}
		},
	};
}

class RealVercelSandboxSession implements VercelSandboxSession {
	readonly #sandbox: VercelSandboxSdkSession;
	readonly name: string;

	constructor(sandbox: VercelSandboxSdkSession) {
		this.#sandbox = sandbox;
		this.name = sandbox.name;
	}

	async runFixedHelloProbe(): Promise<VercelSandboxCommandResult> {
		try {
			const command = await this.#sandbox.runCommand({
				cmd: SANDBOX_HELLO_COMMAND.cmd,
				args: [...SANDBOX_HELLO_COMMAND.args],
			});
			return {
				ok: true,
				exitCode: command.exitCode,
				stdout: await command.stdout(),
			};
		} catch {
			return { ok: false };
		}
	}

	async stop() {
		try {
			await this.#sandbox.stop();
			return { ok: true } as const;
		} catch {
			return { ok: false } as const;
		}
	}
}
