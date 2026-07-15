import { sdkFoldEntries } from "../../../../../scripts/sdk-public-subpaths.mjs";
import { normalizeBinPaths } from "../../../../../scripts/public-package-helpers.mjs";

import { releaseTransactionReportSchema } from "./contracts.ts";

const criticalSdkExports = sdkFoldEntries.map((entry) => entry.sourceExport);

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
):
	| { readonly type: "ok"; readonly value: Record<string, unknown> }
	| { readonly type: "error"; readonly message: string } {
	try {
		const value = JSON.parse(stdout);
		if (!isRecord(value)) throw new Error("expected an object");
		return { type: "ok", value };
	} catch (error) {
		return {
			type: "error",
			message: `npm view returned invalid JSON for ${packageName}@${expectedVersion}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function parseCandidateReport(
	value: unknown,
	expectedPackages: readonly string[],
): ParsedCandidateReport {
	const parsed = releaseTransactionReportSchema.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			`Candidate report must be a canonical schemaVersion 1 release report: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "report"}: ${issue.message}`).join("; ")}`,
		);
	}
	const report = parsed.data;
	if (!sameValues(report.inventory, expectedPackages)) {
		throw new Error("Candidate report inventory does not match the intended public package set");
	}
	if (report.candidates.length !== expectedPackages.length) {
		throw new Error("Candidate report does not contain every intended public package");
	}
	if (
		new Set(report.completedWrites).size !== report.completedWrites.length ||
		report.completedWrites.some((name) => !expectedPackages.includes(name)) ||
		(report.pendingWrite !== null &&
			(!expectedPackages.includes(report.pendingWrite) ||
				report.completedWrites.includes(report.pendingWrite)))
	) {
		throw new Error("Candidate report pending and completed writes do not match the inventory");
	}
	const candidates = new Map<string, CandidateHashEvidence>();
	for (const [order, candidate] of report.candidates.entries()) {
		if (
			candidate.name !== expectedPackages[order] ||
			candidate.version !== report.release.version ||
			candidate.order !== order
		) {
			throw new Error(`Candidate report contains invalid candidate at order ${order}`);
		}
		candidates.set(candidate.name, {
			name: candidate.name,
			version: candidate.version,
			integrity: candidate.integrity,
			shasum: candidate.shasum,
		});
	}
	return {
		releaseCommit: report.release.commit,
		version: report.release.version,
		candidates,
	};
}

export function compareRegistryMetadata(options: {
	readonly packageName: string;
	readonly expectedVersion: string;
	readonly manifest: { readonly bin?: unknown; readonly exports?: unknown };
	readonly registry: Record<string, unknown>;
	readonly candidate?: CandidateHashEvidence;
}): { readonly mismatches: readonly string[]; readonly evidence: readonly string[] } {
	const { packageName, expectedVersion, manifest, registry, candidate } = options;
	const mismatches: string[] = [];
	const evidence: string[] = [];
	const registryDist = isRecord(registry.dist) ? registry.dist : {};
	if (registry.name !== packageName)
		mismatches.push(`name ${formatValue(registry.name)} != ${packageName}`);
	if (registry.version !== expectedVersion)
		mismatches.push(`version ${formatValue(registry.version)} != ${expectedVersion}`);
	if (!hasPresentString(registryDist.tarball) && !hasPresentString(registry["dist.tarball"]))
		mismatches.push("missing dist.tarball");
	if (!hasTimeForVersion(registry.time, expectedVersion))
		mismatches.push(`missing publish time for ${expectedVersion}`);
	compareBin({
		packageName,
		localBin: manifest.bin,
		registryBin: registry.bin,
		mismatches,
		evidence,
	});
	compareExports({
		packageName,
		localExports: manifest.exports,
		registryExports: registry.exports,
		mismatches,
		evidence,
	});
	if (candidate !== undefined) {
		const registryIntegrity = registryDist.integrity ?? registry["dist.integrity"];
		const registryShasum = registryDist.shasum ?? registry["dist.shasum"];
		if (registryIntegrity !== candidate.integrity) {
			mismatches.push(`dist.integrity ${formatValue(registryIntegrity)} != ${candidate.integrity}`);
		} else {
			evidence.push("dist.integrity exact");
		}
		if (registryShasum !== candidate.shasum) {
			mismatches.push(`dist.shasum ${formatValue(registryShasum)} != ${candidate.shasum}`);
		} else {
			evidence.push("dist.shasum exact");
		}
	}
	return { mismatches, evidence };
}

function compareBin(options: {
	readonly packageName: string;
	readonly localBin: unknown;
	readonly registryBin: unknown;
	readonly mismatches: string[];
	readonly evidence: string[];
}): void {
	const { packageName, localBin, registryBin, mismatches, evidence } = options;
	if (localBin === undefined) return;
	const localBinObject = normalizeBinPaths(localBin);
	const registryBinObject = normalizeBinPaths(registryBin);
	for (const [name, target] of Object.entries(localBinObject)) {
		const registryTarget = registryBinObject[name];
		if (registryTarget !== target) {
			mismatches.push(`bin.${name} ${formatValue(registryTarget)} != ${target}`);
			continue;
		}
		if (packageName === "@nseng-ai/ns" && name === "ns") evidence.push("bin.ns = bin/ns.js");
	}
}

function compareExports(options: {
	readonly packageName: string;
	readonly localExports: unknown;
	readonly registryExports: unknown;
	readonly mismatches: string[];
	readonly evidence: string[];
}): void {
	const { packageName, localExports, registryExports, mismatches, evidence } = options;
	if (localExports === undefined) return;
	const localKeys = topLevelExportKeys(localExports);
	const registryKeys = new Set(topLevelExportKeys(registryExports));
	for (const exportKey of localKeys) {
		if (!registryKeys.has(exportKey)) {
			mismatches.push(`missing export ${exportKey}`);
			continue;
		}
		if (packageName === "@nseng-ai/sdk" && criticalSdkExports.includes(exportKey))
			evidence.push(`export ${exportKey}`);
	}
}

function topLevelExportKeys(exportsValue: unknown): string[] {
	if (typeof exportsValue === "string") return ["."];
	if (isRecord(exportsValue)) return Object.keys(exportsValue).sort();
	return [];
}

function hasTimeForVersion(time: unknown, expectedVersion: string): boolean {
	if (time === undefined) return false;
	if (typeof time === "string") return time.length > 0;
	if (isRecord(time)) return typeof time[expectedVersion] === "string";
	return false;
}

function hasPresentString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
	return value === undefined ? "<missing>" : JSON.stringify(value);
}
