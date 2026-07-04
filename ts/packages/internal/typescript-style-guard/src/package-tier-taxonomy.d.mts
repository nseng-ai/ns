export type PackageTierId =
	| "capability"
	| "capability-kit"
	| "sdk"
	| "neutral-infra"
	| "host"
	| "capability-pi"
	| "standalone-tool"
	| "internal-pi-tool"
	| "internal-tool";

export interface PackageTierDefinition {
	readonly id: PackageTierId;
	readonly name: string;
	readonly fill: string;
	readonly stroke: string;
	readonly allowedTargets: readonly PackageTierId[];
}

export const packageTierDefinitions: readonly PackageTierDefinition[];
export const tierRank: readonly PackageTierId[];
export const allowedPackageTierDebtEdgeEntries: readonly (readonly [string, string])[];
