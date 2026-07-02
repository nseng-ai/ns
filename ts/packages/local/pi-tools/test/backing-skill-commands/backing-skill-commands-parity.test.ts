import { describe, expect, test } from "vitest";

import {
	comparePiSurfaceParity,
	formatParityComparisonFailure,
	type LivePiSurface,
} from "@sdl/pi/parity/check";
import { FakePiSurfaceHost, registerWithFakeHost } from "@sdl/pi/parity/testing";
import {
	backingSkillCommandsParity,
	registerBackingSkillCommands,
} from "../../src/backing-skill-commands/extension.ts";

async function collectBackingSkillCommandSurfaces(): Promise<LivePiSurface[]> {
	const pi = new FakePiSurfaceHost();
	await registerWithFakeHost(pi, registerBackingSkillCommands);
	return pi.surfaces();
}

describe("backing-skill command Pi extension parity metadata", () => {
	test("generated command surfaces match generated package metadata", async () => {
		const comparison = comparePiSurfaceParity({
			liveSurfaces: await collectBackingSkillCommandSurfaces(),
			metadata: backingSkillCommandsParity,
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
