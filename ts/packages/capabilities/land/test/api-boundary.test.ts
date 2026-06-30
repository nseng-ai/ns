import { describe, expect, test } from "vitest";

import {
	LAND_CAPABILITY_ID,
	LAND_CAPABILITY_METADATA,
	LAND_PACKAGE_NAME,
	type LandCapabilityMetadata,
} from "sdl-land/api";

function describeLandCapability(metadata: LandCapabilityMetadata): string {
	return `${metadata.packageName}:${metadata.capabilityId}:${metadata.tier}`;
}

describe("sdl-land/api boundary", () => {
	test("exposes land capability package identity through the API subpath", () => {
		expect(describeLandCapability(LAND_CAPABILITY_METADATA)).toBe("sdl-land:land:capability");
		expect(LAND_CAPABILITY_METADATA).toEqual({
			capabilityId: LAND_CAPABILITY_ID,
			packageName: LAND_PACKAGE_NAME,
			tier: "capability",
		});
	});
});
