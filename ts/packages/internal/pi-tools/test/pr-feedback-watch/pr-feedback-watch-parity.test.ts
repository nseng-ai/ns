import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@ns/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@ns/pi/parity/testing";
import prFeedbackWatchExtension, {
	prFeedbackWatchParity,
} from "../../src/pr-feedback-watch/extension.ts";

async function collectPrFeedbackWatchSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, prFeedbackWatchExtension);
	return pi.surfaces();
}

describe("PR feedback watch Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectPrFeedbackWatchSurfaces(),
			metadata: prFeedbackWatchParity,
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
