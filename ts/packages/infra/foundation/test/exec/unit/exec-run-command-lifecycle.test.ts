import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

const spawnMock = vi.fn();
let runCommand: (typeof import("@nseng-ai/foundation/exec"))["runCommand"];

beforeAll(async () => {
	vi.resetModules();
	vi.doMock("node:child_process", async (importOriginal) => {
		const actual = await importOriginal<typeof import("node:child_process")>();
		return { ...actual, spawn: spawnMock };
	});
	({ runCommand } = await import("@nseng-ai/foundation/exec"));
});

afterAll(() => {
	vi.doUnmock("node:child_process");
	vi.resetModules();
});

class FakeChildProcess extends EventEmitter {
	readonly stdin = new PassThrough();
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();

	kill(): boolean {
		return true;
	}
}

describe("runCommand lifecycle classification", () => {
	test("retains a post-spawn child error as diagnostics and classifies from close", async () => {
		const child = new FakeChildProcess();
		spawnMock.mockReturnValue(child);
		const resultPromise = runCommand("command", []);
		expect(child.listenerCount("error")).toBeGreaterThan(0);

		child.emit("spawn");
		child.stderr.write("native stderr\n");
		child.emit("error", new Error("post-spawn diagnostic"));
		child.emit("close", 23, "backend-close-signal");

		await expect(resultPromise).resolves.toEqual({
			type: "exited",
			stdout: "",
			stderr: "native stderr\npost-spawn diagnostic",
			code: 23,
			signal: "backend-close-signal",
		});
	});
});
