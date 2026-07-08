interface PackageTierDefinitionInput {
	readonly name: string;
	readonly fill: string;
	readonly stroke: string;
	readonly allowedTargets: readonly PackageTierId[];
}

export interface PackageTierDefinition extends PackageTierDefinitionInput {
	readonly id: PackageTierId;
}

export interface AllowedPackageTierDebtEdge {
	readonly from: string;
	readonly to: string;
	readonly reason: string;
}

export const packageTierIds = [
	"capability",
	"capability-kit",
	"sdk",
	"neutral-infra",
	"host",
	"capability-pi",
	"standalone-tool",
	"internal-pi-tool",
	"internal-tool",
] as const;

export type PackageTierId = (typeof packageTierIds)[number];

/**
 * Layering policy is rank-derived: a tier may depend on itself and every tier below it in
 * this list. This supersedes the old hand-curated per-tier target lists, which were
 * strictly tighter for host, internal-tool, internal-pi-tool, and standalone-tool.
 */
export const tierRank = [
	"internal-pi-tool",
	"internal-tool",
	"standalone-tool",
	"capability-pi",
	"host",
	"capability",
	"capability-kit",
	"sdk",
	"neutral-infra",
] as const satisfies readonly PackageTierId[];

const packageTierDefinitionsInput = {
	capability: {
		name: "capability",
		fill: "#bbf7d0",
		stroke: "#10b981",
		allowedTargets: downwardTierTargets("capability"),
	},
	"capability-kit": {
		name: "capability kit",
		fill: "#d9f99d",
		stroke: "#65a30d",
		allowedTargets: downwardTierTargets("capability-kit"),
	},
	sdk: {
		name: "SDK",
		fill: "#c7d2fe",
		stroke: "#6366f1",
		allowedTargets: downwardTierTargets("sdk"),
	},
	"neutral-infra": {
		name: "neutral infra",
		fill: "#cbd5e1",
		stroke: "#64748b",
		allowedTargets: downwardTierTargets("neutral-infra"),
	},
	host: {
		name: "presentation host",
		fill: "#475569",
		stroke: "#0f172a",
		allowedTargets: downwardTierTargets("host"),
	},
	"capability-pi": {
		name: "capability Pi",
		fill: "#bae6fd",
		stroke: "#0284c7",
		allowedTargets: downwardTierTargets("capability-pi"),
	},
	"standalone-tool": {
		name: "standalone tool",
		fill: "#f1f5f9",
		stroke: "#94a3b8",
		allowedTargets: downwardTierTargets("standalone-tool"),
	},
	"internal-pi-tool": {
		name: "internal pi tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: downwardTierTargets("internal-pi-tool"),
	},
	"internal-tool": {
		name: "internal tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: downwardTierTargets("internal-tool"),
	},
} as const satisfies Record<PackageTierId, PackageTierDefinitionInput>;

export const packageTierDefinitions: readonly PackageTierDefinition[] = packageTierIds.map(
	(id) => ({
		id,
		...packageTierDefinitionsInput[id],
	}),
);

/**
 * Returns the tier itself plus every lower-ranked target, implementing the rank-derived
 * layering policy instead of the old hand-curated per-tier target lists.
 */
function downwardTierTargets(tier: PackageTierId): readonly PackageTierId[] {
	const tierIndex = tierRank.indexOf(tier);
	return tierRank.slice(tierIndex);
}

export const packageTierDebtEdgeDefinitions = [
	{
		from: "@nseng-ai/kernel",
		to: "@nseng-ai/capability-kit",
		reason:
			"SDK-to-capability-kit CLI shell-support debt: @nseng-ai/kernel still reuses Capability Kit shell wrappers for the ns shell operation.",
	},
	{
		from: "@nseng-ai/brmem",
		to: "@nseng-ai/capability-kit",
		reason:
			"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	},
] as const satisfies readonly AllowedPackageTierDebtEdge[];

export function packageEdgeKey(from: string, to: string): string {
	return `${from}\0${to}`;
}

export const allowedPackageTierDebtEdgeEntries: readonly (readonly [string, string])[] =
	packageTierDebtEdgeDefinitions.map(
		({ from, to, reason }) => [packageEdgeKey(from, to), reason] as const,
	);
