import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@sdl/pi/parity/testing";
import claudeExtension, { claudeHandoffParity } from "../../src/pi/claude-extension.ts";
import handoffExtension, { handoffParity } from "../../src/pi/extension.ts";

async function collectHandoffPiSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, handoffExtension);
	await registerWithFakeHost(pi, claudeExtension);
	return pi.surfaces();
}

describe("Handoff Pi extension parity metadata", () => {
	test("registered command surfaces match package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectHandoffPiSurfaces(),
			metadata: [...handoffParity, ...claudeHandoffParity],
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
