/**
 * Typed parity accounting for Pi surfaces implemented by @asdl/pi-extensions.
 *
 * The cross-harness parity Objective tracks whether Pi command workflows have
 * an agent-neutral route: a CLI plus skill, a known gap, or a deliberate waiver
 * for Pi-native UI/session behavior. That accounting used to live only in
 * human-maintained Markdown, which made drift easy: a module could register a
 * new Pi command while the parity table stayed stale.
 *
 * This module makes the accounting a package-local TypeScript contract. Each
 * registration module exports co-located metadata for the command surfaces it
 * owns; parity-registry.ts aggregates those records; parity.test.ts registers
 * the same package modules against a fake Pi host and compares live command
 * registrations to the metadata. The test proves inventory accounting only. It
 * does not prove that a FULL record is semantically correct, does not inspect
 * whether named CLIs/skills exist, and does not parse parity-table.md.
 *
 * Surface names are exact Pi registration keys, not slash-rendered display
 * names: use `code:submit`, not `/code:submit`. The unique machine key is
 * `kind:surface`.
 *
 * Scope is intentionally narrow for v1: package modules in @asdl/pi-extensions.
 * Ad hoc checked-in `.pi/extensions/*.ts` adapters and direct @asdl/ccc command
 * surfaces are not enforced here unless they are exposed through this package.
 */
export const PI_SURFACE_KINDS = ["command"] as const;
export type PiSurfaceKind = (typeof PI_SURFACE_KINDS)[number];

/**
 * Semantic parity verdicts shared with the cross-harness parity Objective.
 *
 * - FULL: the workflow has a non-Pi CLI/skill path; Pi is additive.
 * - PARTIAL: some non-Pi path exists, but important parity work remains.
 * - NONE: no non-Pi route exists yet; the record must name the tracked gap.
 * - WAIVED: the value is genuinely Pi-native UI/session behavior; the record
 *   must name an agent-neutral fallback for dependent workflows.
 */
export const PI_PARITY_STATUSES = ["FULL", "PARTIAL", "NONE", "WAIVED"] as const;
export type PiParityStatus = (typeof PI_PARITY_STATUSES)[number];

export interface BasePiSurfaceParity {
	/** Exact live Pi command registration kind collected by the fake host. */
	readonly kind: PiSurfaceKind;
	/** Exact Pi registration key, without a leading slash for commands. */
	readonly surface: string;
	/** Human-readable workflow name; not used for machine equality. */
	readonly workflow: string;
	/** The Objective that owns semantic review of this parity verdict. */
	readonly ownerObjective: "cross-harness-parity";
	/** Guardrail that keeps this v1 registry scoped to @asdl/pi-extensions. */
	readonly sourcePackage: "@asdl/pi-extensions";
	/** Co-located source module that owns the registration and this record. */
	readonly sourceModule: string;
	/** Short rationale/provenance for reviewers; not used for machine equality. */
	readonly notes: string;
	/**
	 * Matching mode for the live-registration gate.
	 *
	 * Omitted means exact: the record must correspond to one live fake-host
	 * registration, and one live fake-host registration must correspond to this
	 * record. Dynamic-family records are rare escape hatches for runtime-generated
	 * families that cannot be observed by normal package-module registration; they
	 * are excluded from stale-record checks but do not satisfy missing exact live
	 * surfaces.
	 */
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

export function piSurfaceKey(surface: { readonly kind: string; readonly surface: string }): string {
	return `${surface.kind}:${surface.surface}`;
}
