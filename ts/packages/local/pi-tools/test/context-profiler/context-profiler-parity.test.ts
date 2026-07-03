import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@ji/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@ji/pi/parity/testing";
import {
	contextProfilerParity,
	registerContextProfilerExtension,
} from "../../src/context-profiler/extension.ts";

async function collectContextProfilerSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerContextProfilerExtension);
	return pi.surfaces();
}

describe("context-profiler Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectContextProfilerSurfaces(),
			metadata: contextProfilerParity,
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
