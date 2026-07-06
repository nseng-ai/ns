#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { kernelPublicSubpaths } from "./kernel-public-subpaths.mjs";
import { intendedPublicPackages, readWorkspacePackageManifests, repoRoot } from "./public-package-set.mjs";
import { isMissingPackageResult, normalizeBinPaths, snippet } from "./public-package-helpers.mjs";

const criticalKernelExports = kernelPublicSubpaths.map((subpath) => `./${subpath}`);

const args = parseArgs(process.argv.slice(2));
if (args.shouldShowHelp) {
	printHelp();
	process.exit(0);
}

const packageManifests = await readWorkspacePackageManifests();
const manifestByName = new Map(packageManifests.map((entry) => [entry.manifest.name, entry.manifest]));
const results = [];

console.log("Public package registry verification");
console.log(`Packages: ${intendedPublicPackages.length}`);
console.log(`Version source: ${args.versionOverride === undefined ? "workspace manifests" : `--version ${args.versionOverride}`}`);
console.log("Registry readback: npm view <package>@<version> name version bin exports dist.tarball time --json");
console.log(`Mode: ${args.isStrict ? "strict" : "report (missing/mismatch exits 0)"}`);
console.log("");

for (const packageName of intendedPublicPackages) {
	const manifest = manifestByName.get(packageName);
	if (manifest === undefined) throw new Error(`Intended public package is missing a local workspace manifest: ${packageName}`);
	if (typeof manifest.version !== "string") throw new Error(`Local manifest for ${packageName} is missing a string version`);
	const expectedVersion = args.versionOverride ?? manifest.version;
	const result = verifyPackage({ packageName, expectedVersion, manifest });
	results.push(result);
	console.log(formatPackageResult(result));
}

console.log("");
printSummary(results);

if (results.some((result) => result.status === "error")) {
	process.exitCode = 1;
} else if (args.isStrict && results.some((result) => result.status !== "published")) {
	process.exitCode = 1;
}

function parseArgs(rawArgs) {
	const parsed = { isStrict: false, versionOverride: undefined, shouldShowHelp: false };
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg === "--") continue;
		if (arg === "--strict") {
			parsed.isStrict = true;
			continue;
		}
		if (arg === "--version") {
			const version = rawArgs[index + 1];
			if (version === undefined || version.startsWith("-")) throw new Error("--version requires a version value");
			parsed.versionOverride = version;
			index += 1;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			parsed.shouldShowHelp = true;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return parsed;
}

function printHelp() {
	console.log(`Usage: pnpm --dir ts run release:verify-public -- [--strict] [--version <version>]\n\nReads the npm registry for the intended @nseng-ai/* public package set. Default report mode exits 0 for missing or mismatched registry packages but exits nonzero for local configuration or operational readback errors. Strict mode exits nonzero for missing, mismatched, or errored packages.`);
}

function verifyPackage({ packageName, expectedVersion, manifest }) {
	const npmArgs = [
		"view",
		`${packageName}@${expectedVersion}`,
		"name",
		"version",
		"bin",
		"exports",
		"dist.tarball",
		"time",
		"--json",
	];
	const npmView = spawnSync("npm", npmArgs, { cwd: repoRoot, encoding: "utf8" });
	if (npmView.status !== 0) {
		const stderr = npmView.stderr.trim();
		const stdout = npmView.stdout.trim();
		if (isMissingPackageResult(stderr, stdout)) {
			return { packageName, expectedVersion, status: "missing", details: [], evidence: [] };
		}
		return {
			packageName,
			expectedVersion,
			status: "error",
			details: [`npm view failed with exit ${npmView.status}`, snippet(stderr || stdout)],
			evidence: [],
		};
	}
	const registry = parseNpmViewJson(npmView.stdout, packageName, expectedVersion);
	if (registry.type === "error") return { packageName, expectedVersion, status: "error", details: [registry.message], evidence: [] };
	const comparison = compareRegistryMetadata({ packageName, expectedVersion, manifest, registry: registry.value });
	return {
		packageName,
		expectedVersion,
		status: comparison.mismatches.length === 0 ? "published" : "mismatched",
		details: comparison.mismatches,
		evidence: comparison.evidence,
	};
}

function parseNpmViewJson(stdout, packageName, expectedVersion) {
	try {
		return { type: "ok", value: JSON.parse(stdout) };
	} catch (error) {
		return { type: "error", message: `npm view returned invalid JSON for ${packageName}@${expectedVersion}: ${error.message}` };
	}
}

function compareRegistryMetadata({ packageName, expectedVersion, manifest, registry }) {
	const mismatches = [];
	const evidence = [];
	if (registry.name !== packageName) mismatches.push(`name ${formatValue(registry.name)} != ${packageName}`);
	if (registry.version !== expectedVersion) mismatches.push(`version ${formatValue(registry.version)} != ${expectedVersion}`);
	if (!hasPresentString(registry?.dist?.tarball) && !hasPresentString(registry?.["dist.tarball"])) mismatches.push("missing dist.tarball");
	if (!hasTimeForVersion(registry.time, expectedVersion)) mismatches.push(`missing publish time for ${expectedVersion}`);
	compareBin({ packageName, localBin: manifest.bin, registryBin: registry.bin, mismatches, evidence });
	compareExports({ packageName, localExports: manifest.exports, registryExports: registry.exports, mismatches, evidence });
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
		if (packageName === "@nseng-ai/kernel" && criticalKernelExports.includes(exportKey)) evidence.push(`export ${exportKey}`);
	}
}

function topLevelExportKeys(exportsValue) {
	if (typeof exportsValue === "string") return ["."];
	if (exportsValue !== null && typeof exportsValue === "object" && !Array.isArray(exportsValue)) return Object.keys(exportsValue).sort();
	return [];
}

function hasTimeForVersion(time, expectedVersion) {
	if (time === undefined) return false;
	if (typeof time === "string") return time.length > 0;
	if (time !== null && typeof time === "object" && !Array.isArray(time)) return typeof time[expectedVersion] === "string";
	return false;
}

function hasPresentString(value) {
	return typeof value === "string" && value.length > 0;
}

function formatPackageResult(result) {
	const marker = result.status === "published" ? "✓" : result.status === "missing" || result.status === "mismatched" ? "✗" : "!";
	const suffix = result.status === "published"
		? formatEvidence(result.evidence)
		: result.details.length === 0
			? ""
			: `: ${result.details.join("; ")}`;
	return `${marker} ${result.packageName}@${result.expectedVersion} ${result.status}${suffix}`;
}

function formatEvidence(evidence) {
	if (evidence.length === 0) return "";
	return ` (${evidence.join(", ")})`;
}

function printSummary(results) {
	const counts = { published: 0, missing: 0, mismatched: 0, errors: 0 };
	for (const result of results) {
		if (result.status === "published") counts.published += 1;
		if (result.status === "missing") counts.missing += 1;
		if (result.status === "mismatched") counts.mismatched += 1;
		if (result.status === "error") counts.errors += 1;
	}
	console.log(`Summary: ${counts.published} published, ${counts.missing} missing, ${counts.mismatched} mismatched, ${counts.errors} errors`);
}

function formatValue(value) {
	return value === undefined ? "<missing>" : JSON.stringify(value);
}
