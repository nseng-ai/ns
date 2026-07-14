export interface CandidateHashEvidence {
	readonly name: string;
	readonly version: string;
	readonly integrity: string;
	readonly shasum: string;
}

export interface ParsedCandidateReport {
	readonly releaseCommit: string;
	readonly version: string;
	readonly candidates: ReadonlyMap<string, CandidateHashEvidence>;
}

export function parseNpmViewJson(
	stdout: string,
	packageName: string,
	expectedVersion: string,
): { readonly type: "ok"; readonly value: Record<string, unknown> } | { readonly type: "error"; readonly message: string };
export function parseCandidateReport(
	value: unknown,
	expectedPackages: readonly string[],
): ParsedCandidateReport;
export function compareRegistryMetadata(options: {
	readonly packageName: string;
	readonly expectedVersion: string;
	readonly manifest: { readonly bin?: unknown; readonly exports?: unknown };
	readonly registry: Record<string, unknown>;
	readonly candidate?: CandidateHashEvidence;
}): { readonly mismatches: readonly string[]; readonly evidence: readonly string[] };
