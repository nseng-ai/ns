import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { FakePiSurfaceHost } from "@sdl/pi/parity/testing";
import thermoCouncilExtension, { thermoCouncilParity } from "../src/extension.ts";

async function collectThermoCouncilSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, thermoCouncilExtension);
	return pi.surfaces();
}

async function registerWithFakeHost<TPi>(
	pi: FakePiSurfaceHost,
	register: (pi: TPi) => void | Promise<void>,
): Promise<void> {
	await register(pi as TPi);
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
