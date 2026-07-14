#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
	intendedPublicPackages,
	publicPublishOrder,
	readWorkspacePackageManifests,
	repoRoot,
} from "./public-package-set.mjs";
import { isMissingPackageResult, snippet } from "./public-package-helpers.mjs";
import {
	compareRegistryMetadata,
	parseCandidateReport,
	parseNpmViewJson,
} from "./verify-public-package-set-core.mjs";

const args = parseArgs(process.argv.slice(2));
if (args.shouldShowHelp) {
	printHelp();
	process.exit(0);
}

const packageManifests = await readWorkspacePackageManifests();
const manifestByName = new Map(
	packageManifests.map((entry) => [entry.manifest.name, entry.manifest]),
);
const candidateReport =
	args.candidateReportPath === undefined
		? undefined
		: parseCandidateReport(
				JSON.parse(await readFile(args.candidateReportPath, "utf8")),
				publicPublishOrder,
			);
if (
	candidateReport !== undefined &&
	args.versionOverride !== undefined &&
	candidateReport.version !== args.versionOverride
) {
	throw new Error(
		`Candidate report version ${candidateReport.version} does not match --version ${args.versionOverride}`,
	);
}
const results = [];

console.log("Public package registry verification");
console.log(`Packages: ${intendedPublicPackages.length}`);
console.log(
	`Version source: ${
		args.versionOverride !== undefined
			? `--version ${args.versionOverride}`
			: candidateReport === undefined
				? "workspace manifests"
				: `candidate report ${args.candidateReportPath}`
	}`,
);
console.log(
	"Registry readback: npm view <package>@<version> name version bin exports dist.tarball dist.integrity dist.shasum time --json",
);
console.log(
	`Candidate hashes: ${candidateReport === undefined ? "not supplied (metadata-only)" : args.candidateReportPath}`,
);
console.log(`Mode: ${args.isStrict ? "strict" : "report (missing/mismatch exits 0)"}`);
console.log("");

for (const packageName of intendedPublicPackages) {
	const manifest = manifestByName.get(packageName);
	if (manifest === undefined)
		throw new Error(
			`Intended public package is missing a local workspace manifest: ${packageName}`,
		);
	if (typeof manifest.version !== "string")
		throw new Error(`Local manifest for ${packageName} is missing a string version`);
	const expectedVersion = args.versionOverride ?? candidateReport?.version ?? manifest.version;
	const result = verifyPackage({
		packageName,
		expectedVersion,
		manifest,
		candidate: candidateReport?.candidates.get(packageName),
	});
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
	const parsed = {
		isStrict: false,
		versionOverride: undefined,
		candidateReportPath: undefined,
		shouldShowHelp: false,
	};
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg === "--") continue;
		if (arg === "--strict") {
			parsed.isStrict = true;
			continue;
		}
		if (arg === "--version") {
			const version = rawArgs[index + 1];
			if (version === undefined || version.startsWith("-"))
				throw new Error("--version requires a version value");
			parsed.versionOverride = version;
			index += 1;
			continue;
		}
		if (arg === "--candidate-report") {
			const reportPath = rawArgs[index + 1];
			if (reportPath === undefined || reportPath.startsWith("-"))
				throw new Error("--candidate-report requires a path");
			parsed.candidateReportPath = reportPath;
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
	console.log(
		`Usage: pnpm --dir ts run release:verify-public -- [--strict] [--version <version>] [--candidate-report <path>]\n\nReads the npm registry for the intended @nseng-ai/* public package set. With a candidate report, strict comparison also requires exact dist.integrity and dist.shasum. Without one, standalone metadata verification behavior is preserved. Default report mode exits 0 for missing or mismatched registry packages but exits nonzero for local configuration or operational readback errors. Strict mode exits nonzero for missing, mismatched, or errored packages.`,
	);
}

function verifyPackage({ packageName, expectedVersion, manifest, candidate }) {
	const npmArgs = [
		"view",
		`${packageName}@${expectedVersion}`,
		"name",
		"version",
		"bin",
		"exports",
		"dist.tarball",
		"dist.integrity",
		"dist.shasum",
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
	if (registry.type === "error")
		return {
			packageName,
			expectedVersion,
			status: "error",
			details: [registry.message],
			evidence: [],
		};
	const comparison = compareRegistryMetadata({
		packageName,
		expectedVersion,
		manifest,
		registry: registry.value,
		candidate,
	});
	return {
		packageName,
		expectedVersion,
		status: comparison.mismatches.length === 0 ? "published" : "mismatched",
		details: comparison.mismatches,
		evidence: comparison.evidence,
	};
}

function formatPackageResult(result) {
	const marker =
		result.status === "published"
			? "✓"
			: result.status === "missing" || result.status === "mismatched"
				? "✗"
				: "!";
	const suffix =
		result.status === "published"
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
	console.log(
		`Summary: ${counts.published} published, ${counts.missing} missing, ${counts.mismatched} mismatched, ${counts.errors} errors`,
	);
}
