import { withInterceptedProcessWriters } from "@nseng-ai/clinkr/app/process-writer-interception";
import { describe, expect, test } from "vitest";

describe("withInterceptedProcessWriters", () => {
	test("normalizes string and byte chunks and restores both writers after success", async () => {
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const stdout: string[] = [];
		const stderr: string[] = [];

		await expect(
			withInterceptedProcessWriters(
				{ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) },
				() => {
					process.stdout.write("stdout string");
					process.stdout.write(Buffer.from(" + bytes"));
					process.stderr.write("stderr string");
					process.stderr.write(Buffer.from(" + bytes"));
					return 7;
				},
			),
		).resolves.toBe(7);
		expect(stdout).toEqual(["stdout string", " + bytes"]);
		expect(stderr).toEqual(["stderr string", " + bytes"]);
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("intercepts only requested streams", async () => {
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const stdout: string[] = [];

		await withInterceptedProcessWriters({ stdout: (text) => stdout.push(text) }, () => {
			expect(process.stdout.write).not.toBe(originalStdoutWrite);
			expect(process.stderr.write).toBe(originalStderrWrite);
			process.stdout.write("captured");
		});
		expect(stdout).toEqual(["captured"]);
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("restores writers after rejection", async () => {
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;

		await expect(
			withInterceptedProcessWriters({ stderr: () => {} }, () => {
				throw new Error("action failed");
			}),
		).rejects.toThrow("action failed");
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("rejects nested interception and leaves the outer owner able to restore", async () => {
		const originalStdoutWrite = process.stdout.write;
		const originalStderrWrite = process.stderr.write;
		const stdout: string[] = [];

		await withInterceptedProcessWriters({ stdout: (text) => stdout.push(text) }, async () => {
			const outerStdoutWrite = process.stdout.write;
			await expect(
				withInterceptedProcessWriters({ stderr: () => {} }, async () => {}),
			).rejects.toThrow(/process-global.*await each intercepted run sequentially/u);
			expect(process.stdout.write).toBe(outerStdoutWrite);
			process.stdout.write("outer remains active");
		});
		expect(stdout).toEqual(["outer remains active"]);
		expect(process.stdout.write).toBe(originalStdoutWrite);
		expect(process.stderr.write).toBe(originalStderrWrite);
	});

	test("rejects an empty interception request without claiming the guard", async () => {
		await expect(withInterceptedProcessWriters({}, async () => {})).rejects.toThrow(
			"requires at least one stdout or stderr sink",
		);
		await expect(
			withInterceptedProcessWriters({ stdout: () => {} }, async () => "next"),
		).resolves.toBe("next");
	});
});
