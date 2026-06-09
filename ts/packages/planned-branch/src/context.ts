import { spawn, type SpawnOptions } from "node:child_process";

import { RealPlannedBranchBrmemGateway, type PlannedBranchBrmemGateway } from "./brmem-gateway.ts";
import type { ExecResult } from "./command-runtime.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import { RealPlannedBranchGraphiteGateway, type PlannedBranchGraphiteGateway } from "./graphite-gateway.ts";
import type { ExecOptions, PlanCommandExecApi } from "@asdl/plans";

const DEFAULT_TIMEOUT_KILL_GRACE_MS = 5_000;
const TIMEOUT_EXIT_CODE = 124;

export interface PlannedBranchContext {
	commands: PlanCommandExecApi;
	git: PlannedBranchGitGateway;
	brmem?: PlannedBranchBrmemGateway | undefined;
	graphite?: PlannedBranchGraphiteGateway | undefined;
}

export function createRealPlannedBranchContext(): PlannedBranchContext {
	const commands = new RealCommandExecApi();
	return {
		commands,
		git: new RealPlannedBranchGitGateway(commands),
		brmem: new RealPlannedBranchBrmemGateway(commands),
		graphite: new RealPlannedBranchGraphiteGateway(commands),
	};
}

export class RealCommandExecApi implements PlanCommandExecApi {
	async exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
		return runCommand(command, args, options);
	}
}

export async function runCommand(command: string, args: readonly string[], options: ExecOptions = {}): Promise<ExecResult> {
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let hasTimedOut = false;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
		let killTimer: ReturnType<typeof setTimeout> | undefined;

		const spawnOptions: SpawnOptions = {
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
		};
		if (options.cwd !== undefined) {
			spawnOptions.cwd = options.cwd;
		}
		if (options.signal !== undefined) {
			spawnOptions.signal = options.signal;
		}

		const clearTimers = (): void => {
			if (timeoutTimer !== undefined) clearTimeout(timeoutTimer);
			if (killTimer !== undefined) clearTimeout(killTimer);
		};

		const finish = (exitCode: number, killed?: boolean): void => {
			if (settled) return;
			settled = true;
			clearTimers();
			resolve({
				stdout,
				stderr,
				code: hasTimedOut ? TIMEOUT_EXIT_CODE : exitCode,
				killed: killed ?? hasTimedOut,
			});
		};

		const child = spawn(command, [...args], spawnOptions);
		if (options.timeout !== undefined && options.timeout > 0) {
			timeoutTimer = setTimeout(() => {
				hasTimedOut = true;
				child.kill("SIGTERM");
				killTimer = setTimeout(() => {
					if (!settled) child.kill("SIGKILL");
				}, DEFAULT_TIMEOUT_KILL_GRACE_MS);
			}, options.timeout);
		}

		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			if (stderr.length === 0) stderr = error instanceof Error ? error.message : String(error);
			finish(127);
		});
		child.on("close", (code, signal) => {
			finish(code ?? 1, signal !== null || hasTimedOut);
		});
	});
}
