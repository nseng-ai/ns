export const PI_SURFACE_KINDS = ["command", "tool"] as const;
export type PiSurfaceKind = (typeof PI_SURFACE_KINDS)[number];

export const PI_PARITY_STATUSES = ["FULL", "PARTIAL", "NONE", "WAIVED"] as const;
export type PiParityStatus = (typeof PI_PARITY_STATUSES)[number];

export interface BasePiSurfaceParity {
	readonly kind: PiSurfaceKind;
	readonly surface: string;
	readonly workflow: string;
	readonly ownerObjective: "cross-harness-parity";
	readonly sourcePackage: "@asdl/pi-extensions";
	readonly sourceModule: string;
	readonly notes: string;
	readonly matching?: { readonly type: "exact" } | { readonly type: "dynamic-family"; readonly rationale: string };
}

export interface FullPiSurfaceParity extends BasePiSurfaceParity {
	readonly parity: "FULL";
	readonly cli: string;
	readonly skill: string;
}

export interface GapPiSurfaceParity extends BasePiSurfaceParity {
	readonly parity: "PARTIAL" | "NONE";
	readonly trackedGap: string;
}

export interface WaivedPiSurfaceParity extends BasePiSurfaceParity {
	readonly parity: "WAIVED";
	readonly fallback: string;
}

export type PiSurfaceParity = FullPiSurfaceParity | GapPiSurfaceParity | WaivedPiSurfaceParity;

export function definePiSurfaceParity<const T extends readonly PiSurfaceParity[]>(records: T): T {
	return records;
}

export function piSurfaceParityMatching(record: PiSurfaceParity): NonNullable<PiSurfaceParity["matching"]> {
	return record.matching ?? { type: "exact" };
}

export function piSurfaceKey(surface: Pick<PiSurfaceParity, "kind" | "surface">): string {
	return `${surface.kind}:${surface.surface}`;
}
