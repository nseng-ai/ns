import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
	LAND_CAPABILITY_ID,
	LAND_CAPABILITY_METADATA,
	LAND_PACKAGE_NAME,
	landCompleted,
	landFailure,
	landSuccess,
	type LandCapabilityMetadata,
	type LandingBoundaryFailure,
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

	test("keeps public identity constants aligned with package metadata", () => {
		const packageJson = readLandPackageJson();

		expect(LAND_PACKAGE_NAME).toBe(packageJson.name);
		expect(LAND_CAPABILITY_METADATA.packageName).toBe(packageJson.name);
		expect(LAND_CAPABILITY_METADATA.tier).toBe(packageJson.sdl.tier);
		expect(LAND_CAPABILITY_ID).toBe("land");
	});

	test("exports land-owned result helpers", () => {
		const failure: LandingBoundaryFailure = {
			type: "boundary",
			phase: "preflight",
			source: "git",
			code: "failed",
			message: "failed",
		};

		expect(landSuccess("ok")).toEqual({ type: "success", value: "ok" });
		expect(landFailure(failure)).toEqual({ type: "failure", failure });
		expect(landCompleted()).toEqual({ type: "completed" });
	});
});

interface LandPackageJson {
	readonly name: string;
	readonly sdl: { readonly tier: "capability" };
}

function readLandPackageJson(): LandPackageJson {
	const raw = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
	if (!isLandPackageJson(raw)) {
		throw new Error("sdl-land package.json does not match expected test shape");
	}
	return raw;
}

function isLandPackageJson(value: unknown): value is LandPackageJson {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof value.name === "string" &&
		"sdl" in value &&
		typeof value.sdl === "object" &&
		value.sdl !== null &&
		"tier" in value.sdl &&
		value.sdl.tier === "capability"
	);
}
