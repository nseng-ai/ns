import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@sdl/pi/parity/testing";
import {
	prPreviewsExtensionParity,
	registerPrPreviewsExtension,
} from "../../src/pr-previews/extension.ts";

async function collectPrPreviewSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerPrPreviewsExtension);
	return pi.surfaces();
}

describe("PR previews Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectPrPreviewSurfaces(),
			metadata: prPreviewsExtensionParity,
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
