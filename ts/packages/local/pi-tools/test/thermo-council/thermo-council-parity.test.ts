import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@ji/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@ji/pi/parity/testing";
import thermoCouncilExtension, { thermoCouncilParity } from "../../src/thermo-council/extension.ts";

async function collectThermoCouncilSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, thermoCouncilExtension);
	return pi.surfaces();
}

describe("thermo-council Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectThermoCouncilSurfaces(),
			metadata: thermoCouncilParity,
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
