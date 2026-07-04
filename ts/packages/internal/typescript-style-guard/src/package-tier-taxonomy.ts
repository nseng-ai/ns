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

const packageTierDefinitionsInput = {
	capability: {
		name: "capability",
		fill: "#bbf7d0",
		stroke: "#10b981",
		allowedTargets: ["capability", "capability-kit", "sdk", "neutral-infra"],
	},
	"capability-kit": {
		name: "capability kit",
		fill: "#d9f99d",
		stroke: "#65a30d",
		allowedTargets: ["sdk", "neutral-infra"],
	},
	sdk: {
		name: "SDK",
		fill: "#c7d2fe",
		stroke: "#6366f1",
		allowedTargets: ["sdk", "neutral-infra"],
	},
	"neutral-infra": {
		name: "neutral infra",
		fill: "#cbd5e1",
		stroke: "#64748b",
		allowedTargets: ["neutral-infra"],
	},
	host: {
		name: "presentation host",
		fill: "#475569",
		stroke: "#0f172a",
		allowedTargets: ["capability", "sdk", "capability-kit", "neutral-infra"],
	},
	"capability-pi": {
		name: "capability Pi",
		fill: "#bae6fd",
		stroke: "#0284c7",
		allowedTargets: [
			"capability-pi",
			"host",
			"capability",
			"capability-kit",
			"sdk",
			"neutral-infra",
		],
	},
	"standalone-tool": {
		name: "standalone tool",
		fill: "#f1f5f9",
		stroke: "#94a3b8",
		allowedTargets: [
			"standalone-tool",
			"host",
			"capability",
			"capability-kit",
			"sdk",
			"neutral-infra",
		],
	},
	"internal-pi-tool": {
		name: "internal pi tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: ["internal-pi-tool", "host", "neutral-infra"],
	},
	"internal-tool": {
		name: "internal tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: ["internal-tool", "neutral-infra"],
	},
} as const;

export type PackageTierId = keyof typeof packageTierDefinitionsInput;

type PackageTierDefinitionsById = {
	readonly [Id in PackageTierId]: PackageTierDefinitionInput;
};

export const packageTierDefinitionsById =
	packageTierDefinitionsInput satisfies PackageTierDefinitionsById;

export const packageTierDefinitions: readonly PackageTierDefinition[] = packageTierEntries().map(
	([id, definition]) => ({ id, ...definition }),
);

export const tierRank = defineTierRank([
	"internal-pi-tool",
	"internal-tool",
	"standalone-tool",
	"capability-pi",
	"host",
	"capability",
	"capability-kit",
	"sdk",
	"neutral-infra",
] as const);

export const allowedPackageTierDebtEdges = [
	{
		from: "@ns/kernel",
		to: "@ns/slot",
		reason: "SDK-to-capability CLI mount debt: @ns/kernel still mounts Slot directly.",
	},
	{
		from: "@ns/kernel",
		to: "@ns/capability-kit",
		reason:
			"SDK-to-capability-kit CLI shell-support debt: @ns/kernel still reuses Capability Kit shell wrappers for the ns shell operation.",
	},
	{
		from: "@ns/brmem",
		to: "@ns/capability-kit",
		reason:
			"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	},
	{
		from: "@internal/pi-tools",
		to: "@ns/capability-kit",
		reason:
			"Internal Pi tools container still reuses Capability Kit GitHub identity and text-repair helpers; resolve when internal-pi-tool helper placement is settled.",
	},
] as const satisfies readonly AllowedPackageTierDebtEdge[];

export const allowedPackageTierDebtEdgeEntries: readonly (readonly [string, string])[] =
	allowedPackageTierDebtEdges.map(({ from, to, reason }) => [`${from}\0${to}`, reason] as const);

function packageTierEntries(): Array<readonly [PackageTierId, PackageTierDefinitionInput]> {
	return Object.entries(packageTierDefinitionsById) as Array<
		readonly [PackageTierId, PackageTierDefinitionInput]
	>;
}

function defineTierRank<const TierRank extends readonly PackageTierId[]>(
	tierRank: TierRank &
		([PackageTierId] extends [TierRank[number]]
			? unknown
			: readonly ["Missing package tier rank", Exclude<PackageTierId, TierRank[number]>]),
): TierRank {
	return tierRank;
}
