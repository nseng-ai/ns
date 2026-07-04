export interface PackageTierDefinition {
	readonly id: string;
	readonly name: string;
	readonly fill: string;
	readonly stroke: string;
	readonly allowedTargets: readonly string[];
}

export const packageTierDefinitions: readonly PackageTierDefinition[];
export const tierRank: readonly string[];
export const allowedPackageTierDebtEdgeEntries: readonly (readonly [string, string])[];
