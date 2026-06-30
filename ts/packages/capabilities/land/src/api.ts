export const LAND_CAPABILITY_ID = "land";
export const LAND_PACKAGE_NAME = "sdl-land";

export interface LandCapabilityMetadata {
	readonly capabilityId: typeof LAND_CAPABILITY_ID;
	readonly packageName: typeof LAND_PACKAGE_NAME;
	readonly tier: "capability";
}

export const LAND_CAPABILITY_METADATA: LandCapabilityMetadata = {
	capabilityId: LAND_CAPABILITY_ID,
	packageName: LAND_PACKAGE_NAME,
	tier: "capability",
};
