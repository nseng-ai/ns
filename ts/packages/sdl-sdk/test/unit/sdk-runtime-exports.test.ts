import { describe, expect, test } from "vitest";
import { z as zod } from "zod";

import * as sdk from "sdl-sdk";

const EXPECTED_RUNTIME_EXPORTS = [
	"defineExtension",
	"defineRepoLocalSdlExtensionDescriptor",
	"failed",
	"noopSdlCommandIo",
	"noopSdlProgress",
	"normalizeTextOutput",
	"repoLocalSdlCommandDescriptor",
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

	test("defineRepoLocalSdlExtensionDescriptor preserves the descriptor object at runtime", () => {
		const descriptor = { group: "example", description: "Example.", commands: [] };
		expect(sdk.defineRepoLocalSdlExtensionDescriptor(descriptor)).toBe(descriptor);
	});

	test("repoLocalSdlCommandDescriptor keeps command name as the default leaf slug", () => {
		const command = {
			name: "list",
			summary: "List things.",
			description: "List things.",
			run: () => sdk.ok("done"),
		} satisfies sdk.SdlCommand;

		expect(
			sdk.repoLocalSdlCommandDescriptor({
				command,
				manifestPath: ["review", "list"],
				packageExportPrefix: "@sdl/example/commands",
			}),
		).toEqual({
			command,
			manifestPath: ["review", "list"],
			manifestEntry: "./src/commands/list.ts",
			packageExport: "@sdl/example/commands/list",
		});
	});

	test("repoLocalSdlCommandDescriptor accepts an explicit manifest name for route-encoded leaves", () => {
		const command = {
			name: "list",
			summary: "List things.",
			description: "List things.",
			run: () => sdk.ok("done"),
		} satisfies sdk.SdlCommand;

		expect(
			sdk.repoLocalSdlCommandDescriptor({
				command,
				manifestName: "review-list",
				manifestPath: ["review", "list"],
				packageExportPrefix: "@sdl/example/commands",
			}),
		).toEqual({
			command,
			manifestName: "review-list",
			manifestPath: ["review", "list"],
			manifestEntry: "./src/commands/review-list.ts",
			packageExport: "@sdl/example/commands/review-list",
		});
	});
});
