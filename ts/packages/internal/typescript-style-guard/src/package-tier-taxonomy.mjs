export const packageTierDefinitions = [
	{
		id: "capability",
		name: "capability",
		fill: "#bbf7d0",
		stroke: "#10b981",
		allowedTargets: ["capability", "capability-kit", "sdk", "neutral-infra"],
	},
	{
		id: "capability-kit",
		name: "capability kit",
		fill: "#d9f99d",
		stroke: "#65a30d",
		allowedTargets: ["sdk", "neutral-infra"],
	},
	{
		id: "sdk",
		name: "SDK",
		fill: "#c7d2fe",
		stroke: "#6366f1",
		allowedTargets: ["sdk", "neutral-infra"],
	},
	{
		id: "neutral-infra",
		name: "neutral infra",
		fill: "#cbd5e1",
		stroke: "#64748b",
		allowedTargets: ["neutral-infra"],
	},
	{
		id: "host",
		name: "presentation host",
		fill: "#475569",
		stroke: "#0f172a",
		allowedTargets: ["capability", "sdk", "capability-kit", "neutral-infra"],
	},
	{
		id: "capability-pi",
		name: "capability Pi",
		fill: "#bae6fd",
		stroke: "#0284c7",
		allowedTargets: ["capability-pi", "host", "capability", "capability-kit", "sdk", "neutral-infra"],
	},
	{
		id: "standalone-tool",
		name: "standalone tool",
		fill: "#f1f5f9",
		stroke: "#94a3b8",
		allowedTargets: ["standalone-tool", "host", "capability", "capability-kit", "sdk", "neutral-infra"],
	},
	{
		id: "internal-pi-tool",
		name: "internal pi tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: ["internal-pi-tool", "host", "neutral-infra"],
	},
	{
		id: "internal-tool",
		name: "internal tool",
		fill: "#e7e5e4",
		stroke: "#a8a29e",
		allowedTargets: ["internal-tool", "neutral-infra"],
	},
];

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
];

export const allowedPackageTierDebtEdgeEntries = [
	[
		"@ns/kernel\0@ns/slot",
		"SDK-to-capability CLI mount debt: @ns/kernel still mounts Slot directly.",
	],
	[
		"@ns/kernel\0@ns/capability-kit",
		"SDK-to-capability-kit CLI shell-support debt: @ns/kernel still reuses Capability Kit shell wrappers for the sdl shell operation.",
	],
	[
		"@ns/brmem\0@ns/capability-kit",
		"Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
	],
	[
		"@internal/pi-tools\0@ns/capability-kit",
		"Internal Pi tools container still reuses Capability Kit GitHub identity and text-repair helpers; resolve when internal-pi-tool helper placement is settled.",
	],
];
