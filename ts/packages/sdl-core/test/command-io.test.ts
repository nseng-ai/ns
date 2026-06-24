import { describe, expect, test } from "vitest";

import { createCommandIo, runWithCommandIo } from "../src/command-io.ts";

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

	test("suppress drops phase", () => {
		const fallback: string[] = [];

		createCommandIo({ suppress: true, phaseFallback: (text) => fallback.push(text) }).phase(
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
			suppress: true,
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

describe("runWithCommandIo", () => {
	test("clears phase on success and thrown error", async () => {
		const events: string[] = [];
		const io = createCommandIo({ phaseSticky: (value) => events.push(String(value)) });

		await expect(runWithCommandIo(io, async () => "ok")).resolves.toBe("ok");
		await expect(
			runWithCommandIo(io, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");

		expect(events).toEqual(["undefined", "undefined"]);
	});
});
