import { describe, expect, test } from "vitest";
import { z as zod } from "zod";

import * as sdk from "sdl-sdk";

const EXPECTED_RUNTIME_EXPORTS = [
	"defineExtension",
	"failed",
	"noopSdlCommandIo",
	"noopSdlProgress",
	"normalizeTextOutput",
	"ok",
	"stripOuterCodeFence",
	"trimOuterBlankLines",
	"truncateTextHead",
	"truncateTextHeadTail",
	"z",
] as const;

describe("sdl-sdk runtime exports", () => {
	test("exposes the intended runtime author surface", () => {
		expect(Object.keys(sdk).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
	});

	test("provides result helpers, noop services, and the shared schema builder", () => {
		expect(sdk.ok("done")).toEqual({ ok: true, message: "done" });
		expect(sdk.failed("nope", 3)).toEqual({ ok: false, exitCode: 3, message: "nope" });
		expect(() => sdk.noopSdlCommandIo.phase("working")).not.toThrow();
		expect(() =>
			sdk.noopSdlProgress.phase({ type: "phase-started", phaseKey: "test" }),
		).not.toThrow();
		expect(sdk.z).toBe(zod);
	});

	test("defineExtension preserves the extension object at runtime", () => {
		const extension = {};
		expect(sdk.defineExtension(extension)).toBe(extension);
	});
});
