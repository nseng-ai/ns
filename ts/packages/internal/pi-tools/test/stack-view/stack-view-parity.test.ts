import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@nseng-ai/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@nseng-ai/pi/parity/testing";
import registerStackViewExtension, { stackViewParity } from "../../src/stack-view/extension.ts";

async function collectStackViewSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerStackViewExtension);
	return pi.surfaces();
}

describe("stack-view Pi extension parity metadata", () => {
	test("registered command surface matches package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectStackViewSurfaces(),
			metadata: stackViewParity,
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
