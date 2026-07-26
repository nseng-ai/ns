import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi-runtime/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi-runtime/parity/testing";

import codeWorkflowsExtension, { codeWorkflowsParity } from "../../src/code-workflows/extension.ts";
import smartRestackExtension, {
	smartRestackParity,
} from "../../src/code-workflows/smart-restack.ts";

async function collectCodeWorkflowSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, codeWorkflowsExtension);
	await registerWithFakeHost(pi, smartRestackExtension);
	return pi.surfaces();
}

const codeWorkflowParity = [...codeWorkflowsParity, ...smartRestackParity] as const;

describe("Internal code-workflows Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectCodeWorkflowSurfaces(),
			metadata: codeWorkflowParity,
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
});
