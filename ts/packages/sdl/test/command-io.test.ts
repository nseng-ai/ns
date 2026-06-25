import { describe, expect, test } from "vitest";

import { commandIoFromSdlExtensionApi } from "../src/sdk/command-io.ts";
import type { SdlExtensionApi } from "../src/sdk/index.ts";

function createCtx(overrides: Partial<SdlExtensionApi>): SdlExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		exec: async () => ({ code: 0, killed: false, stdout: "", stderr: "" }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		...overrides,
	};
}

describe("commandIoFromSdlExtensionApi", () => {
	test("phase prefers onOutput and falls back to stderr", () => {
		const live: Array<{ stream: string; text: string }> = [];
		const stderr: string[] = [];

		commandIoFromSdlExtensionApi(
			createCtx({
				onOutput: (stream, text) => live.push({ stream, text }),
				stderr: (text) => stderr.push(text),
			}),
		).phase("Working");
		commandIoFromSdlExtensionApi(createCtx({ stderr: (text) => stderr.push(text) })).phase(
			"Fallback",
		);

		expect(live).toEqual([{ stream: "stderr", text: "Working\n" }]);
		expect(stderr).toEqual(["Fallback\n"]);
	});

	test("notify routes info to stdout and diagnostics to stderr", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const io = commandIoFromSdlExtensionApi(
			createCtx({
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
			}),
		);

		io.notify("Done");
		io.notify("Warn", "warning");
		io.notify("Err", "error");

		expect(stdout).toEqual(["Done\n"]);
		expect(stderr).toEqual(["Warn\n", "Err\n"]);
	});

	test("suppresses phase and keeps info off stdout", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const live: string[] = [];
		const io = commandIoFromSdlExtensionApi(
			createCtx({
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				onOutput: (_stream, text) => live.push(text),
			}),
			{ shouldSuppress: true },
		);

		io.phase("Hidden");
		io.notify("Info");

		expect(live).toEqual([]);
		expect(stdout).toEqual([]);
		expect(stderr).toEqual(["Info\n"]);
	});
});
