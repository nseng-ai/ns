import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import { describe, expect, test } from "vitest";

import {
	createPiCommandExecApi,
	type RawPiExecApi,
	type RawPiExecOptions,
	type RawPiExecResult,
} from "../src/kit/shared/command-exec.ts";

interface ExecCall {
	readonly command: string;
	readonly args: string[];
	readonly options: RawPiExecOptions | undefined;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolvePromise: ((value: T) => void) | undefined;
	let rejectPromise: ((error: unknown) => void) | undefined;
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});
	return {
		promise,
		resolve(value) {
			if (resolvePromise === undefined) throw new Error("deferred promise was not initialized");
			resolvePromise(value);
		},
		reject(error) {
			if (rejectPromise === undefined) throw new Error("deferred promise was not initialized");
			rejectPromise(error);
		},
	};
}

function recordingPi(invoke: (options: RawPiExecOptions | undefined) => Promise<RawPiExecResult>): {
	readonly pi: RawPiExecApi;
	readonly calls: ExecCall[];
} {
	const calls: ExecCall[] = [];
	return {
		calls,
		pi: {
			async exec(command, args, options) {
				calls.push({ command, args: [...args], options });
				return await invoke(options);
			},
		},
	};
}

function rawResult(overrides: Partial<RawPiExecResult> = {}): RawPiExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

async function run(
	result: Partial<RawPiExecResult>,
	options: ExecOptions = {},
): Promise<{ readonly result: ExecResult; readonly calls: ExecCall[] }> {
	const recorded = recordingPi(async () => rawResult(result));
	return {
		result: await createPiCommandExecApi(recorded.pi).exec("git", ["status"], options),
		calls: recorded.calls,
	};
}

describe("createPiCommandExecApi", () => {
	test.each([
		[
			{ stdout: "ok\n", code: 0 },
			{ type: "exited", stdout: "ok\n", stderr: "", code: 0, signal: null },
		],
		[
			{ stderr: "nope", code: 2 },
			{ type: "exited", stdout: "", stderr: "nope", code: 2, signal: null },
		],
	] as const)("maps completed Pi results", async (raw, expected) => {
		const actual = await run(raw, {
			cwd: "/repo",
			timeout: 50,
			env: { IGNORED: "true" },
			stdin: "ignored",
		});

		expect(actual.result).toEqual(expected);
		expect(actual.calls).toHaveLength(1);
		expect(actual.calls[0]?.options).toMatchObject({
			cwd: "/repo",
			signal: expect.any(AbortSignal),
		});
		expect(actual.calls[0]?.options).not.toHaveProperty("timeout");
		expect(actual.calls[0]?.options).not.toHaveProperty("env");
		expect(actual.calls[0]?.options).not.toHaveProperty("stdin");
	});

	test("maps an unowned raw killed result to exited", async () => {
		const actual = await run({ stdout: "partial", code: 143, killed: true });
		expect(actual.result).toEqual({
			type: "exited",
			stdout: "partial",
			stderr: "",
			code: 143,
			signal: null,
		});
	});

	test("maps a rejected Pi invocation to spawn-failed", async () => {
		const recorded = recordingPi(async () => {
			throw new Error("could not invoke");
		});
		const result = await createPiCommandExecApi(recorded.pi).exec("missing", []);
		expect(result).toEqual({
			type: "spawn-failed",
			stdout: "",
			stderr: "could not invoke",
			error: "could not invoke",
		});
	});

	test("does not invoke Pi when the caller signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const recorded = recordingPi(async () => rawResult());
		const result = await createPiCommandExecApi(recorded.pi).exec("git", [], {
			signal: controller.signal,
		});

		expect(recorded.calls).toEqual([]);
		expect(result).toEqual({
			type: "cancelled",
			stdout: "",
			stderr: "",
			code: null,
			signal: null,
		});
	});

	test("classifies in-flight caller abort and forwards its composed signal", async () => {
		const pending = deferred<RawPiExecResult>();
		const recorded = recordingPi(async () => await pending.promise);
		const controller = new AbortController();
		const resultPromise = createPiCommandExecApi(recorded.pi).exec("git", [], {
			signal: controller.signal,
		});
		const upstreamSignal = recorded.calls[0]?.options?.signal;

		controller.abort();
		expect(upstreamSignal?.aborted).toBe(true);
		pending.resolve(rawResult({ stdout: "partial", code: 130, killed: true }));
		expect(await resultPromise).toEqual({
			type: "cancelled",
			stdout: "partial",
			stderr: "",
			code: 130,
			signal: null,
		});
	});

	test("classifies an owned timeout with a manual scheduler", async () => {
		const manual = createManualTimerScheduler();
		const pending = deferred<RawPiExecResult>();
		const recorded = recordingPi(async () => await pending.promise);
		const resultPromise = createPiCommandExecApi(recorded.pi, { timers: manual.timers }).exec(
			"git",
			[],
			{ timeout: 25 },
		);

		expect(manual.pendingTimerCount()).toBe(1);
		manual.advanceMs(25);
		expect(recorded.calls[0]?.options?.signal?.aborted).toBe(true);
		pending.resolve(rawResult({ code: 143, killed: true }));
		expect(await resultPromise).toEqual({
			type: "timed-out",
			stdout: "",
			stderr: "",
			code: 143,
			signal: null,
		});
		expect(manual.pendingTimerCount()).toBe(0);
	});

	test.each([
		["caller abort", "cancelled"],
		["timeout", "timed-out"],
	] as const)("classifies rejection after owned %s", async (_label, expectedType) => {
		const manual = createManualTimerScheduler();
		const pending = deferred<RawPiExecResult>();
		const recorded = recordingPi(async () => await pending.promise);
		const controller = new AbortController();
		const resultPromise = createPiCommandExecApi(recorded.pi, { timers: manual.timers }).exec(
			"git",
			[],
			{ signal: controller.signal, timeout: 10 },
		);

		if (expectedType === "cancelled") {
			controller.abort();
		} else {
			manual.advanceMs(10);
		}
		pending.reject(new Error("upstream rejected after abort"));
		expect(await resultPromise).toEqual({
			type: expectedType,
			stdout: "",
			stderr: "",
			code: null,
			signal: null,
		});
	});

	test.each([
		["caller abort wins", "cancelled"],
		["timeout wins", "timed-out"],
	] as const)("preserves first cause when %s before rejection", async (_label, expectedType) => {
		const manual = createManualTimerScheduler();
		const pending = deferred<RawPiExecResult>();
		const recorded = recordingPi(async () => await pending.promise);
		const controller = new AbortController();
		const resultPromise = createPiCommandExecApi(recorded.pi, { timers: manual.timers }).exec(
			"git",
			[],
			{ signal: controller.signal, timeout: 10 },
		);

		if (expectedType === "cancelled") {
			controller.abort();
			manual.advanceMs(10);
		} else {
			manual.advanceMs(10);
			controller.abort();
		}
		pending.reject(new Error("upstream rejected after competing aborts"));
		expect(await resultPromise).toEqual({
			type: expectedType,
			stdout: "",
			stderr: "",
			code: null,
			signal: null,
		});
	});
});
