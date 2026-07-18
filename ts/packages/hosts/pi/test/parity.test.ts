import { describe, expect, test } from "vitest";

import prExtension from "../src/core/pr/extension.ts";
import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "../src/parity/check.ts";
import { loadPiExtensionParityRecords } from "../src/parity/registry.ts";
import { definePiSurfaceParity } from "../src/runtime/parity-extension.ts";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi/parity/testing";

async function collectLivePiExtensionSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();

	await registerWithFakeHost(pi, prExtension);
	// The worktree-status implementation lives in @nseng-ai/pi/worktree-status and is
	// discovered through .pi/extensions/worktree-status.ts. Include its live command
	// shape directly because the extension needs host runtime options to register.
	pi.registerCommand("pi:worktree-status-refresh", {
		description: "Refresh the worktree status footer",
		handler() {},
	});

	return pi.surfaces();
}

describe("Pi extension parity metadata", () => {
	test("all @nseng-ai/pi command surfaces have parity metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectLivePiExtensionSurfaces(),
			metadata: loadPiExtensionParityRecords(),
		});

		if (
			comparison.missingMetadata.length > 0 ||
			comparison.staleMetadata.length > 0 ||
			comparison.duplicateMetadataKeys.length > 0
		) {
			throw new Error(formatParityComparisonFailure(comparison));
		}

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});

	test("comparison reports live command surfaces missing exact metadata", () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "command", surface: "code:missing" }],
			metadata: [],
		});

		expect(comparison.missingMetadata).toEqual([{ kind: "command", surface: "code:missing" }]);
		expect(comparison.staleMetadata).toEqual([]);
	});

	test("comparison ignores live tool surfaces for missing metadata", () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "tool", surface: "pi_native_tool" }],
			metadata: [],
		});

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});

	test("comparison reports stale exact metadata", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "fixture:stale",
				workflow: "Fixture stale command",
				parity: "WAIVED",
				fallback: "Use a fixture fallback.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@nseng-ai/pi",
				sourceModule: "fixture",
				notes: "Fixture metadata for stale-check coverage.",
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison.missingMetadata).toEqual([]);
		expect(comparison.staleMetadata).toEqual(metadata);
	});

	test("dynamic-family metadata accounts for matching live generated commands only", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "model:*",
				workflow: "Fixture runtime command family",
				parity: "WAIVED",
				fallback: "Use a fixture fallback.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@nseng-ai/pi",
				sourceModule: "fixture",
				notes: "Fixture metadata for dynamic-family matching coverage.",
				matching: { type: "dynamic-family", rationale: "Generated from fixture policy." },
			},
		] as const);

		const comparison = comparePiSurfaceParity({
			liveSurfaces: [
				{ kind: "command", surface: "model:fast" },
				{ kind: "command", surface: "model:" },
				{ kind: "command", surface: "models:unrelated" },
			],
			metadata,
		});

		expect(comparison).toEqual({
			missingMetadata: [
				{ kind: "command", surface: "model:" },
				{ kind: "command", surface: "models:unrelated" },
			],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});

	test("comparison excludes dynamic-family metadata from stale checks", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "runtime-family:*",
				workflow: "Fixture runtime command family",
				parity: "WAIVED",
				fallback: "Use a fixture fallback.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@nseng-ai/pi",
				sourceModule: "fixture",
				notes: "Fixture metadata for dynamic-family stale-check coverage.",
				matching: { type: "dynamic-family", rationale: "Generated only by runtime fixtures." },
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison).toEqual({
			missingMetadata: [],
			staleMetadata: [],
			duplicateMetadataKeys: [],
		});
	});

	test("comparison reports duplicate exact metadata keys", () => {
		const metadata = definePiSurfaceParity([
			{
				kind: "command",
				surface: "code:duplicate",
				workflow: "Fixture duplicate command",
				parity: "NONE",
				trackedGap: "Fixture tracked gap.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@nseng-ai/pi",
				sourceModule: "fixture-a",
				notes: "First fixture duplicate.",
			},
			{
				kind: "command",
				surface: "code:duplicate",
				workflow: "Fixture duplicate command",
				parity: "NONE",
				trackedGap: "Fixture tracked gap.",
				ownerObjective: "cross-harness-parity",
				sourcePackage: "@nseng-ai/pi",
				sourceModule: "fixture-b",
				notes: "Second fixture duplicate.",
			},
		] as const);

		const comparison = comparePiSurfaceParity({
			liveSurfaces: [{ kind: "command", surface: "code:duplicate" }],
			metadata,
		});

		expect(comparison.duplicateMetadataKeys).toEqual(["command:code:duplicate"]);
	});
});
