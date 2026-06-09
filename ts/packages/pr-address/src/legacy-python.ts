import { spawn } from "node:child_process";
import process from "node:process";

import { findLegacyCheckoutRoot } from "./repo-root.ts";

// 0.1.1 is the oldest published asdl-pr-address release on PyPI; the previous
// 0.1.0 pin was never published and could not resolve.
export const LEGACY_PR_ADDRESS_VERSION = "0.1.1";

export interface LegacyRunOptions {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
}

export interface LegacyPrAddressGateway {
	run(args: readonly string[], options: LegacyRunOptions): Promise<number>;
}

export interface ProcessRunRequest {
	command: string;
	args: readonly string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	stdio: "inherit";
}

export type ProcessRunner = (request: ProcessRunRequest) => Promise<number>;

type ForwardedSignal = "SIGHUP" | "SIGINT" | "SIGTERM";

const FORWARDED_SIGNALS: readonly ForwardedSignal[] = ["SIGHUP", "SIGINT", "SIGTERM"];
const SIGNAL_EXIT_CODES: Readonly<Record<ForwardedSignal, number>> = {
	SIGHUP: 129,
	SIGINT: 130,
	SIGTERM: 143,
};

export interface RealLegacyPrAddressGatewayOptions {
	runProcess?: ProcessRunner | undefined;
}

export class RealLegacyPrAddressGateway implements LegacyPrAddressGateway {
	private readonly runProcess: ProcessRunner;

	constructor(options: RealLegacyPrAddressGatewayOptions = {}) {
		this.runProcess = options.runProcess ?? runProcessWithInheritedStdio;
	}

	async run(args: readonly string[], options: LegacyRunOptions): Promise<number> {
		const repoRoot = findLegacyCheckoutRoot(options.cwd);
		const env = options.env ?? process.env;
		if (repoRoot !== undefined) {
			return await this.runProcess({
				command: "uv",
				args: ["run", "--project", repoRoot, "pr-address", ...args],
				cwd: options.cwd,
				env,
				stdio: "inherit",
			});
		}

		return await this.runProcess({
			command: "uvx",
			args: ["--from", `asdl-pr-address==${LEGACY_PR_ADDRESS_VERSION}`, "pr-address", ...args],
			cwd: options.cwd,
			env,
			stdio: "inherit",
		});
	}
}

export async function runProcessWithInheritedStdio(request: ProcessRunRequest): Promise<number> {
	return await new Promise<number>((resolve, reject) => {
		const child = spawn(request.command, [...request.args], {
			cwd: request.cwd,
			env: request.env,
			stdio: request.stdio,
		});
		let signalExitCode: number | undefined;
		const signalHandlers = FORWARDED_SIGNALS.map((signal) => {
			function handler(): void {
				signalExitCode = SIGNAL_EXIT_CODES[signal];
				child.kill(signal);
			}
			process.once(signal, handler);
			return { signal, handler };
		});

		function cleanup(): void {
			for (const { signal, handler } of signalHandlers) {
				process.off(signal, handler);
			}
		}

		child.on("error", (error) => {
			cleanup();
			reject(error);
		});
		child.on("close", (code) => {
			cleanup();
			resolve(code ?? signalExitCode ?? 1);
		});
	});
}
