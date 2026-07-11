import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import { systemTimerScheduler } from "@nseng-ai/foundation/time";
import type { ScheduledTimer, TimerScheduler } from "@nseng-ai/foundation/timers";

export type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";

/** The structural result returned by Pi's upstream exec capability. */
export interface RawPiExecResult {
	readonly stdout?: string;
	readonly stderr?: string;
	readonly code: number;
	readonly killed?: boolean;
}

/** Only options supported by Pi's upstream exec capability. */
export interface RawPiExecOptions {
	readonly cwd?: string;
	readonly signal?: AbortSignal;
	readonly timeout?: number;
}

export interface RawPiExecApi {
	exec(command: string, args: string[], options?: RawPiExecOptions): Promise<RawPiExecResult>;
}

export interface CreatePiCommandExecApiOptions {
	readonly timers?: TimerScheduler;
}

/** Adapt Pi's host exec capability to ns's authoritative command result contract. */
export function createPiCommandExecApi(
	pi: RawPiExecApi,
	options: CreatePiCommandExecApiOptions = {},
): CommandExecApi {
	const timers = options.timers ?? systemTimerScheduler;
	return {
		async exec(command, args, execOptions = {}) {
			return await execWithPi(pi, timers, command, args, execOptions);
		},
	};
}

export type ExecGateway = CommandExecApi;

type OwnedTerminationCause = "cancelled" | "timed-out";

async function execWithPi(
	pi: RawPiExecApi,
	timers: TimerScheduler,
	command: string,
	args: string[],
	options: ExecOptions,
): Promise<ExecResult> {
	if (options.signal?.aborted === true) {
		return { type: "cancelled", stdout: "", stderr: "", code: null, signal: null };
	}

	const controller = new AbortController();
	let ownedCause: OwnedTerminationCause | undefined;
	let timeoutTimer: ScheduledTimer | undefined;

	function terminate(cause: OwnedTerminationCause): void {
		if (ownedCause !== undefined) return;
		ownedCause = cause;
		controller.abort();
	}

	function cancel(): void {
		terminate("cancelled");
	}

	options.signal?.addEventListener("abort", cancel, { once: true });
	if (options.timeout !== undefined && options.timeout > 0) {
		timeoutTimer = timers.setTimeout(() => terminate("timed-out"), options.timeout);
	}

	try {
		const result = await pi.exec(command, args, {
			...(options.cwd === undefined ? {} : { cwd: options.cwd }),
			signal: controller.signal,
		});
		const stdout = result.stdout ?? "";
		const stderr = result.stderr ?? "";
		if (ownedCause !== undefined) {
			return { type: ownedCause, stdout, stderr, code: result.code, signal: null };
		}
		return { type: "exited", stdout, stderr, code: result.code, signal: null };
	} catch (error) {
		if (ownedCause !== undefined) {
			return { type: ownedCause, stdout: "", stderr: "", code: null, signal: null };
		}
		const message = formatErrorMessage(error);
		return { type: "spawn-failed", stdout: "", stderr: message, error: message };
	} finally {
		timeoutTimer?.cancel();
		options.signal?.removeEventListener("abort", cancel);
	}
}
