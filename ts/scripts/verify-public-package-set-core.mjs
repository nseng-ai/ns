import { sdkFoldEntries } from "./sdk-public-subpaths.mjs";
import { normalizeBinPaths } from "./public-package-helpers.mjs";

const criticalSdkExports = sdkFoldEntries.map((entry) => entry.sourceExport);

export function parseNpmViewJson(stdout, packageName, expectedVersion) {
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

export function parseCandidateReport(value, expectedPackages) {
	if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.release)) {
		throw new Error("Candidate report must be a schemaVersion 1 release report");
	}
	if (
		typeof value.release.branch !== "string" ||
		value.release.branch.length === 0 ||
		typeof value.release.commit !== "string" ||
		value.release.commit.length === 0 ||
		typeof value.release.version !== "string" ||
		value.release.version.length === 0 ||
		!Array.isArray(value.inventory) ||
		!value.inventory.every((name) => typeof name === "string") ||
		!Array.isArray(value.candidates) ||
		!Array.isArray(value.completedWrites) ||
		!value.completedWrites.every((name) => typeof name === "string") ||
		!(value.pendingWrite === null || typeof value.pendingWrite === "string") ||
		![
			"preparing-candidates",
			"candidates-prepared",
			"checkpointing",
			"publishing",
			"published",
			"verified",
		].includes(value.stage)
	) {
		throw new Error(
			"Candidate report has invalid release, inventory, candidates, writes, or stage fields",
		);
	}
	if (!sameValues(value.inventory, expectedPackages)) {
		throw new Error("Candidate report inventory does not match the intended public package set");
	}
	if (value.candidates.length !== expectedPackages.length) {
		throw new Error("Candidate report does not contain every intended public package");
	}
	if (
		new Set(value.completedWrites).size !== value.completedWrites.length ||
		value.completedWrites.some((name) => !expectedPackages.includes(name)) ||
		(value.pendingWrite !== null &&
			(!expectedPackages.includes(value.pendingWrite) || value.completedWrites.includes(value.pendingWrite)))
	) {
		throw new Error("Candidate report pending and completed writes do not match the inventory");
	}
	const candidates = new Map();
	for (const [order, candidate] of value.candidates.entries()) {
		if (
			!isRecord(candidate) ||
			candidate.name !== expectedPackages[order] ||
			candidate.version !== value.release.version ||
			candidate.order !== order ||
			typeof candidate.tarballPath !== "string" ||
			!candidate.tarballPath.endsWith(".tgz") ||
			typeof candidate.integrity !== "string" ||
			candidate.integrity.length === 0 ||
			typeof candidate.shasum !== "string" ||
			candidate.shasum.length === 0
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
		releaseCommit: value.release.commit,
		version: value.release.version,
		candidates,
	};
}

export function compareRegistryMetadata({
	packageName,
	expectedVersion,
	manifest,
	registry,
	candidate,
}) {
	const mismatches = [];
	const evidence = [];
	if (registry.name !== packageName)
		mismatches.push(`name ${formatValue(registry.name)} != ${packageName}`);
	if (registry.version !== expectedVersion)
		mismatches.push(`version ${formatValue(registry.version)} != ${expectedVersion}`);
	if (!hasPresentString(registry?.dist?.tarball) && !hasPresentString(registry?.["dist.tarball"]))
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
		const registryIntegrity = registry?.dist?.integrity ?? registry?.["dist.integrity"];
		const registryShasum = registry?.dist?.shasum ?? registry?.["dist.shasum"];
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

function compareBin({ packageName, localBin, registryBin, mismatches, evidence }) {
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

function compareExports({ packageName, localExports, registryExports, mismatches, evidence }) {
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

function topLevelExportKeys(exportsValue) {
	if (typeof exportsValue === "string") return ["."];
	if (isRecord(exportsValue)) return Object.keys(exportsValue).sort();
	return [];
}

function hasTimeForVersion(time, expectedVersion) {
	if (time === undefined) return false;
	if (typeof time === "string") return time.length > 0;
	if (isRecord(time)) return typeof time[expectedVersion] === "string";
	return false;
}

function hasPresentString(value) {
	return typeof value === "string" && value.length > 0;
}

function sameValues(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value) {
	return value === undefined ? "<missing>" : JSON.stringify(value);
}
