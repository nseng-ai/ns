import { describe, expect, test } from "vitest";

import investigateExtension from "../src/investigate/extension.ts";
import modelShortcutExtension from "../src/models/shortcuts.ts";
import prExtension from "../src/pr/extension.ts";
import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "../src/parity/check.ts";
import { loadPiExtensionParityRecords } from "../src/parity/registry.ts";
import { definePiSurfaceParity } from "../src/parity/extension.ts";
import { FakePiSurfaceHost, registerWithFakeHost } from "@sdl/pi/parity/testing";
import type { PiAgentDefinition } from "../src/runtime/agent-definition.ts";

async function collectLivePiExtensionSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();

	await registerWithFakeHost(pi, registerInvestigateWithFakeDefinition);
	await registerWithFakeHost(pi, modelShortcutExtension);
	await registerWithFakeHost(pi, prExtension);
	// The worktree-status implementation lives in @sdl/worktree-status and is
	// discovered through .pi/extensions/worktree-status.ts, but @sdl/pi owns the
	// static parity registry. Include its live command shape without importing the
	// package and creating a test-only cycle.
	pi.registerCommand("pi:worktree-status-refresh", {
		description: "Refresh the worktree status footer",
		handler() {},
	});

	return pi.surfaces();
}

function registerInvestigateWithFakeDefinition(
	pi: Parameters<typeof investigateExtension>[0],
): void {
	investigateExtension(pi, { loadAgentDefinition: () => fakeInvestigatorAgentDefinition() });
}

function fakeInvestigatorAgentDefinition(): PiAgentDefinition {
	return {
		schema: "sdl.pi-agent.v1",
		name: "investigator",
		toolName: "investigate",
		label: "Investigator",
		description: "Run a fixture investigation.",
		promptGuidelines: [],
		body: "Investigate this prompt:\n\n{{prompt}}",
		filePath: "/fixture/.sdl/pi/agents/investigator.md",
	};
}

describe("Pi extension parity metadata", () => {
	test("all @sdl/pi command surfaces have parity metadata", async () => {
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
				sourcePackage: "@sdl/pi",
				sourceModule: "fixture",
				notes: "Fixture metadata for stale-check coverage.",
			},
		] as const);

		const comparison = comparePiSurfaceParity({ liveSurfaces: [], metadata });

		expect(comparison.missingMetadata).toEqual([]);
		expect(comparison.staleMetadata).toEqual(metadata);
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
				sourcePackage: "@sdl/pi",
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
				sourcePackage: "@sdl/pi",
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
				sourcePackage: "@sdl/pi",
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
