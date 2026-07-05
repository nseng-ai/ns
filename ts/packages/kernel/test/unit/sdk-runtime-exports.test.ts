import { describe, expect, test } from "vitest";
import { z as zod } from "zod";

import {
	defineExtension,
	defineRepoLocalNsExtensionDescriptor,
	failed,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	ok,
	repoLocalNsCommandDescriptor,
	nsExtensionManifestCommandSchema,
	nsExtensionManifestSchema,
	nsExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
	type NsCommand,
} from "@nseng-ai/kernel/sdk";

const runtimeExports = {
	defineExtension,
	defineRepoLocalNsExtensionDescriptor,
	failed,
	noopNsCommandIo,
	noopNsProgress,
	normalizeTextOutput,
	repoLocalNsCommandDescriptor,
	ok,
	nsExtensionManifestCommandSchema,
	nsExtensionManifestSchema,
	nsExtensionPackageManifestSchema,
	stripOuterCodeFence,
	trimOuterBlankLines,
	truncateTextHead,
	truncateTextHeadTail,
	z,
} satisfies Record<string, unknown>;

const EXPECTED_RUNTIME_EXPORTS = [
	"defineExtension",
	"defineRepoLocalNsExtensionDescriptor",
	"failed",
	"noopNsCommandIo",
	"noopNsProgress",
	"normalizeTextOutput",
	"repoLocalNsCommandDescriptor",
	"ok",
	"nsExtensionManifestCommandSchema",
	"nsExtensionManifestSchema",
	"nsExtensionPackageManifestSchema",
	"stripOuterCodeFence",
	"trimOuterBlankLines",
	"truncateTextHead",
	"truncateTextHeadTail",
	"z",
] as const;

describe("@nseng-ai/kernel/sdk runtime exports", () => {
	test("exposes the intended runtime author surface", () => {
		expect(Object.keys(runtimeExports).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
	});

	test("provides result helpers, noop services, and the shared schema builder", () => {
		expect(ok("done")).toEqual({ ok: true, message: "done" });
		expect(failed("nope", 3)).toEqual({ ok: false, exitCode: 3, message: "nope" });
		expect(() => noopNsCommandIo.phase("working")).not.toThrow();
		expect(() => noopNsProgress.phase({ type: "phase-started", phaseKey: "test" })).not.toThrow();
		expect(z).toBe(zod);
	});

	test("defineExtension preserves the extension object at runtime", () => {
		const extension = {};
		expect(defineExtension(extension)).toBe(extension);
	});

	test("defineRepoLocalNsExtensionDescriptor preserves the descriptor object at runtime", () => {
		const descriptor = { group: "example", description: "Example.", commands: [] };
		expect(defineRepoLocalNsExtensionDescriptor(descriptor)).toBe(descriptor);
	});

	test("repoLocalNsCommandDescriptor keeps command name as the default leaf slug", () => {
		const command = {
			name: "list",
			summary: "List things.",
			description: "List things.",
			run: () => ok("done"),
		} satisfies NsCommand;

		expect(
			repoLocalNsCommandDescriptor({
				command,
				manifestPath: ["review", "list"],
				packageExportPrefix: "@nseng-ai/example/commands",
			}),
		).toEqual({
			command,
			manifestPath: ["review", "list"],
			manifestEntry: "./src/commands/list.ts",
			packageExport: "@nseng-ai/example/commands/list",
		});
	});

	test("repoLocalNsCommandDescriptor accepts an explicit manifest name for route-encoded leaves", () => {
		const command = {
			name: "list",
			summary: "List things.",
			description: "List things.",
			run: () => ok("done"),
		} satisfies NsCommand;

		expect(
			repoLocalNsCommandDescriptor({
				command,
				manifestName: "review-list",
				manifestPath: ["review", "list"],
				packageExportPrefix: "@nseng-ai/example/commands",
			}),
		).toEqual({
			command,
			manifestName: "review-list",
			manifestPath: ["review", "list"],
			manifestEntry: "./src/commands/review-list.ts",
			packageExport: "@nseng-ai/example/commands/review-list",
		});
	});

	test("extension manifest schemas accept permissive package manifests", () => {
		const parsed = nsExtensionPackageManifestSchema.parse({
			description: "Package description.",
			private: true,
			ns: {
				description: "ns commands.",
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
		expect(parsed.ns?.owner).toBe("repo-local");
		expect(parsed.ns?.commands?.[0]).toMatchObject({ futureField: "kept" });
		expect(nsExtensionManifestCommandSchema.parse(parsed.ns?.commands?.[0])).toMatchObject({
			name: "changes",
			futureField: "kept",
		});
	});
});
