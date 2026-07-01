import { optionalEntries } from "@sdl/core/primitives";
import { describe, expect, test } from "vitest";

import {
	commandIoFromSdlExtensionApi,
	createCliCommandIo,
	createCommandIo,
	runWithSdlCommandIo,
} from "../src/sdk/command-io.ts";
import { noopSdlProgress } from "sdl-sdk";
import type { SdlExtensionApi } from "sdl-sdk";

function createCtx(overrides: Partial<SdlExtensionApi>): SdlExtensionApi {
	const commandIo = createCliCommandIo(
		optionalEntries({
			stdout: overrides.stdout,
			stderr: overrides.stderr,
			onOutput: overrides.onOutput,
		}),
	);
	return {
		cwd: "/repo",
		env: {},
		commandIo,
		progress: noopSdlProgress,
		renderCapabilities: { canEmitAnsi: false },
		exec: async () => ({ code: 0, killed: false, stdout: "", stderr: "" }),
		textGenerator: { generateText: async () => ({ ok: true, text: "" }) },
		...overrides,
	};
}

describe("commandIoFromSdlExtensionApi", () => {
	test("uses the required context service by default", () => {
		const stdout: string[] = [];
		const ctx = createCtx({ stdout: (text) => stdout.push(text) });

		commandIoFromSdlExtensionApi(ctx).notify("Done");

		expect(stdout).toEqual(["Done\n"]);
	});

	test("can derive a suppressed wrapper from low-level hooks", () => {
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

describe("createCommandIo", () => {
	test("phase prefers sticky, then transient, then fallback", () => {
		const sticky: Array<string | undefined> = [];
		const transient: string[] = [];
		const fallback: string[] = [];

		createCommandIo({
			phaseSticky: (value) => sticky.push(value),
			phaseTransient: (text) => transient.push(text),
			phaseFallback: (text) => fallback.push(text),
		}).phase("Sticky phase");
		createCommandIo({
			phaseTransient: (text) => transient.push(text),
			phaseFallback: (text) => fallback.push(text),
		}).phase("Transient phase");
		createCommandIo({ phaseFallback: (text) => fallback.push(text) }).phase("Fallback phase");

		expect(sticky).toEqual(["Sticky phase"]);
		expect(transient).toEqual(["Transient phase\n"]);
		expect(fallback).toEqual(["Fallback phase\n"]);
	});

	test("shouldSuppress drops phase", () => {
		const fallback: string[] = [];

		createCommandIo({ shouldSuppress: true, phaseFallback: (text) => fallback.push(text) }).phase(
			"Hidden phase",
		);

		expect(fallback).toEqual([]);
	});

	test("clearPhase clears sticky only", () => {
		const sticky: Array<string | undefined> = [];
		const fallback: string[] = [];

		createCommandIo({
			phaseSticky: (value) => sticky.push(value),
			phaseFallback: (text) => fallback.push(text),
		}).clearPhase();
		createCommandIo({ phaseFallback: (text) => fallback.push(text) }).clearPhase();

		expect(sticky).toEqual([undefined]);
		expect(fallback).toEqual([]);
	});

	test("notify routes info and diagnostics", () => {
		const info: string[] = [];
		const diagnostic: string[] = [];
		const io = createCommandIo({
			notifyInfo: (text) => info.push(text),
			notifyDiagnostic: (text) => diagnostic.push(text),
		});

		io.notify("Done");
		io.notify("Careful", "warning");
		io.notify("Broken", "error");

		expect(info).toEqual(["Done\n"]);
		expect(diagnostic).toEqual(["Careful\n", "Broken\n"]);
	});

	test("suppressed info routes to diagnostic and notifyUi is preferred", () => {
		const info: string[] = [];
		const diagnostic: string[] = [];
		const ui: Array<{ message: string; level: string | undefined }> = [];

		createCommandIo({
			shouldSuppress: true,
			notifyInfo: (text) => info.push(text),
			notifyDiagnostic: (text) => diagnostic.push(text),
		}).notify("Machine-safe");
		createCommandIo({
			notifyInfo: (text) => info.push(text),
			notifyUi: (message, level) => ui.push({ message, level }),
		}).notify("Visible", "warning");

		expect(info).toEqual([]);
		expect(diagnostic).toEqual(["Machine-safe\n"]);
		expect(ui).toEqual([{ message: "Visible", level: "warning" }]);
	});
});

describe("message", () => {
	test("routes to the rich sink with details when present", () => {
		const rich: Array<{ text: string; level: string; details: unknown }> = [];
		const fallback: string[] = [];
		const io = createCommandIo({
			richMessage: (text, options) =>
				rich.push({ text, level: options.level, details: options.details }),
			phaseFallback: (text) => fallback.push(text),
		});

		io.message("Landed #101", { level: "info", details: { prLinks: [{ number: 101 }] } });

		expect(rich).toEqual([
			{ text: "Landed #101", level: "info", details: { prLinks: [{ number: 101 }] } },
		]);
		expect(fallback).toEqual([]);
	});

	test("omits details for the rich sink when not provided", () => {
		const rich: Array<{ text: string; options: { level: string; details?: unknown } }> = [];
		const io = createCommandIo({
			richMessage: (text, options) => rich.push({ text, options }),
		});

		io.message("Working...", { level: "warning" });

		expect(rich).toEqual([{ text: "Working...", options: { level: "warning" } }]);
		expect("details" in (rich[0]?.options ?? {})).toBe(false);
	});

	test("falls back to phase text when no rich sink exists", () => {
		const fallback: string[] = [];
		const io = createCommandIo({ phaseFallback: (text) => fallback.push(text) });

		io.message("Progress line");

		expect(fallback).toEqual(["Progress line\n"]);
	});

	test("drops isRichOnly messages when no rich sink exists", () => {
		const fallback: string[] = [];
		const io = createCommandIo({ phaseFallback: (text) => fallback.push(text) });

		io.message("Final summary", { isRichOnly: true });

		expect(fallback).toEqual([]);
	});
});

describe("createCliCommandIo", () => {
	test("maps CLI callbacks to SdlCommandIo channels", () => {
		const stdout: string[] = [];
		const stderr: string[] = [];
		const output: Array<{ stream: string; text: string }> = [];
		let errorNotifications = 0;
		const io = createCliCommandIo(
			{
				stdout: (text) => stdout.push(text),
				stderr: (text) => stderr.push(text),
				onOutput: (stream, text) => output.push({ stream, text }),
			},
			{ onNotifyError: () => (errorNotifications += 1) },
		);

		io.phase("Working");
		io.notify("Done");
		io.notify("Careful", "warning");
		io.notify("Broken", "error");

		expect(output).toEqual([{ stream: "stderr", text: "Working\n" }]);
		expect(stdout).toEqual(["Done\n"]);
		expect(stderr).toEqual(["Careful\n", "Broken\n"]);
		expect(errorNotifications).toBe(1);
	});

	test("supports optional SDK-style callbacks and suppression", () => {
		const output: Array<{ stream: string; text: string }> = [];
		const io = createCliCommandIo(
			{ onOutput: (stream, text) => output.push({ stream, text }) },
			{ shouldSuppress: true },
		);

		io.phase("Hidden");
		io.notify("Info");

		expect(output).toEqual([]);
	});
});

describe("runWithSdlCommandIo", () => {
	test("clears phase on success and thrown error", async () => {
		const events: string[] = [];
		const io = createCommandIo({ phaseSticky: (value) => events.push(String(value)) });

		await expect(runWithSdlCommandIo(io, async () => "ok")).resolves.toBe("ok");
		await expect(
			runWithSdlCommandIo(io, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(events).toEqual(["undefined", "undefined"]);
	});
});
