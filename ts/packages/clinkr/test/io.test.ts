import { afterEach, describe, expect, test, vi } from "vitest";

import { resolveIo } from "../src/io.ts";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("resolveIo", () => {
	test("uses both overrides when provided", () => {
		const out: string[] = [];
		const err: string[] = [];
		const io = resolveIo({
			stdout: (text) => out.push(text),
			stderr: (text) => err.push(text),
		});
		io.stdout("to stdout");
		io.stderr("to stderr");
		expect(out).toEqual(["to stdout"]);
		expect(err).toEqual(["to stderr"]);
	});

	test("a stdout override leaves stderr on the process stream", () => {
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const out: string[] = [];
		const io = resolveIo({ stdout: (text) => out.push(text) });
		io.stdout("captured");
		io.stderr("passed through");
		expect(out).toEqual(["captured"]);
		expect(stderrSpy).toHaveBeenCalledWith("passed through");
	});

	test("a stderr override leaves stdout on the process stream", () => {
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const err: string[] = [];
		const io = resolveIo({ stderr: (text) => err.push(text) });
		io.stdout("passed through");
		io.stderr("captured");
		expect(err).toEqual(["captured"]);
		expect(stdoutSpy).toHaveBeenCalledWith("passed through");
	});

	test("no arguments yields working process io for both streams", () => {
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		const io = resolveIo();
		io.stdout("out text");
		io.stderr("err text");
		expect(stdoutSpy).toHaveBeenCalledWith("out text");
		expect(stderrSpy).toHaveBeenCalledWith("err text");
	});

	test("a custom stdout sink disables ANSI output by default (redirected output)", () => {
		expect(resolveIo({ stdout: () => {} }).canEmitAnsi).toBe(false);
	});

	test("an explicit ANSI override wins over sink detection", () => {
		expect(resolveIo({ stdout: () => {}, canEmitAnsi: true }).canEmitAnsi).toBe(true);
	});

	test("NO_COLOR disables ANSI output even on a TTY", () => {
		vi.stubEnv("NO_COLOR", "1");
		const original = process.stdout.isTTY;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		try {
			expect(resolveIo().canEmitAnsi).toBe(false);
		} finally {
			Object.defineProperty(process.stdout, "isTTY", { value: original, configurable: true });
		}
	});
});
