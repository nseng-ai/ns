import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@ji/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@ji/pi/parity/testing";
import { grillUiParity, registerGrillUiExtension } from "../../src/grill/extension.ts";

async function collectGrillSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerGrillUiExtension);
	return pi.surfaces();
}

describe("grill Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectGrillSurfaces(),
			metadata: grillUiParity,
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
