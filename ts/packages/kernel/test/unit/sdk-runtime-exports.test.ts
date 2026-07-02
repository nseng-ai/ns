import { describe, expect, test } from "vitest";
import { z as zod } from "zod";

import {
	defineExtension,
	defineRepoLocalSdlExtensionDescriptor,
	failed,
	noopSdlCommandIo,
	noopSdlProgress,
	normalizeTextOutput,
	ok,
	repoLocalSdlCommandDescriptor,
	sdlExtensionManifestCommandSchema,
	sdlExtensionManifestSchema,
	sdlExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
	type SdlCommand,
} from "@sdl/kernel/sdk";

const runtimeExports = {
	defineExtension,
	defineRepoLocalSdlExtensionDescriptor,
	failed,
	noopSdlCommandIo,
	noopSdlProgress,
	normalizeTextOutput,
	repoLocalSdlCommandDescriptor,
	ok,
	sdlExtensionManifestCommandSchema,
	sdlExtensionManifestSchema,
	sdlExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} satisfies Record<string, unknown>;

const EXPECTED_RUNTIME_EXPORTS = [
	"defineExtension",
	"defineRepoLocalSdlExtensionDescriptor",
	"failed",
	"noopSdlCommandIo",
	"noopSdlProgress",
	"normalizeTextOutput",
	"repoLocalSdlCommandDescriptor",
	"ok",
	"sdlExtensionManifestCommandSchema",
	"sdlExtensionManifestSchema",
	"sdlExtensionPackageManifestSchema",
	"stripOuterCodeFence",
	"trimOuterBlankLines",
	"truncateTextHead",
	"truncateTextHeadTail",
	"z",
] as const;

describe("@sdl/kernel/sdk runtime exports", () => {
	test("exposes the intended runtime author surface", () => {
		expect(Object.keys(runtimeExports).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
	});

	test("provides result helpers, noop services, and the shared schema builder", () => {
		expect(ok("done")).toEqual({ ok: true, message: "done" });
		expect(failed("nope", 3)).toEqual({ ok: false, exitCode: 3, message: "nope" });
		expect(() => noopSdlCommandIo.phase("working")).not.toThrow();
		expect(() => noopSdlProgress.phase({ type: "phase-started", phaseKey: "test" })).not.toThrow();
		expect(z).toBe(zod);
	});

	test("defineExtension preserves the extension object at runtime", () => {
		const extension = {};
		expect(defineExtension(extension)).toBe(extension);
	});

	test("defineRepoLocalSdlExtensionDescriptor preserves the descriptor object at runtime", () => {
		const descriptor = { group: "example", description: "Example.", commands: [] };
		expect(defineRepoLocalSdlExtensionDescriptor(descriptor)).toBe(descriptor);
	});

	test("repoLocalSdlCommandDescriptor keeps command name as the default leaf slug", () => {
		const command = {
			name: "list",
			summary: "List things.",
			description: "List things.",
			run: () => ok("done"),
		} satisfies SdlCommand;

		expect(
			repoLocalSdlCommandDescriptor({
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
			run: () => ok("done"),
		} satisfies SdlCommand;

		expect(
			repoLocalSdlCommandDescriptor({
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

	test("extension manifest schemas accept permissive package manifests", () => {
		const parsed = sdlExtensionPackageManifestSchema.parse({
			description: "Package description.",
			private: true,
			sdl: {
				description: "SDL commands.",
				group: "flow",
				owner: "repo-local",
				commands: [
					{
						name: "changes",
						path: ["flow", "changes"],
						group: "flow",
						description: "Show changes.",
						fullDescription: "Show changes with details.",
						entry: "./src/changes.ts",
						futureField: "kept",
					},
				],
			},
		});

		expect(parsed.private).toBe(true);
		expect(parsed.sdl?.owner).toBe("repo-local");
		expect(parsed.sdl?.commands?.[0]).toMatchObject({ futureField: "kept" });
		expect(sdlExtensionManifestCommandSchema.parse(parsed.sdl?.commands?.[0])).toMatchObject({
			name: "changes",
			futureField: "kept",
		});
	});
});
