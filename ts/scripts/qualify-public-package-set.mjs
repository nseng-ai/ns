#!/usr/bin/env node
import {
	assertCoordinatedVersion,
	firstBatchPackages,
	intendedPublicPackages,
	loadPublicPackageContext,
	preparePublishRoot,
	publicPublishOrder,
	repoRoot,
	run,
} from "./public-package-set.mjs";

const args = parseArgs(process.argv.slice(2));
const packagesToQualify = args.shouldQualifyAll ? publicPublishOrder : firstBatchPackages;

const context = await loadPublicPackageContext();
if (args.version !== undefined) assertCoordinatedVersion(context, args.version);

console.log("Intended public package set:");
for (const packageName of intendedPublicPackages) console.log(`- ${packageName}`);
console.log("");
if (args.version !== undefined) console.log(`Coordinated version: ${args.version}`);
console.log(`Qualifying ${packagesToQualify.length} package(s): ${packagesToQualify.join(", ")}`);

for (const packageName of packagesToQualify) {
	const entry = context.manifestByName.get(packageName);
	if (entry === undefined) throw new Error(`Unknown workspace package ${packageName}`);
	if (!args.shouldSkipChecks) {
		run("pnpm", ["--dir", "ts", "--filter", packageName, "run", "check"], { cwd: repoRoot });
		run("pnpm", ["--dir", "ts", "--filter", packageName, "run", "test"], { cwd: repoRoot });
	}
	if (packageName === "@nseng-ai/ns") {
		qualifyNsPackage(args);
		continue;
	}
	console.log(`Preparing publish root for ${packageName}`);
	const publishRoot = await preparePublishRoot(entry, context);
	if (packageName === "@nseng-ai/sdk" && !args.shouldSkipChecks) {
		run("node", ["ts/scripts/smoke-kernel-consumer-resolution.mjs", publishRoot], { cwd: repoRoot });
	}
	if (!args.shouldSkipDryRun) run("npm", ["publish", "--dry-run", publishRoot], { cwd: repoRoot });
}

console.log("Public package qualification completed without registry writes.");

function parseArgs(rawArgs) {
	const parsed = { shouldQualifyAll: false, shouldSkipChecks: false, shouldSkipDryRun: false, version: undefined };
	for (let index = 0; index < rawArgs.length; index += 1) {
		const arg = rawArgs[index];
		if (arg === "--") continue;
		if (arg === "--all") {
			parsed.shouldQualifyAll = true;
			continue;
		}
		if (arg === "--skip-checks") {
			parsed.shouldSkipChecks = true;
			continue;
		}
		if (arg === "--skip-dry-run") {
			parsed.shouldSkipDryRun = true;
			continue;
		}
		if (arg === "--version") {
			const version = rawArgs[index + 1];
			if (version === undefined || version.startsWith("-")) throw new Error("--version requires a version value");
			parsed.version = version;
			index += 1;
			continue;
		}
		if (arg === "-h" || arg === "--help") {
			printHelp();
			process.exit(0);
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return parsed;
}

function printHelp() {
	console.log(`Usage: pnpm --dir ts run release:qualify-public -- [--all] [--version <version>] [--skip-checks] [--skip-dry-run]\n\nQualifies the intended public @nseng-ai/* package set without registry writes. --version asserts every intended public source manifest is already coordinated to the requested version.`);
}

function qualifyNsPackage(args) {
	const script = args.shouldSkipDryRun ? "pack:local" : "publish:dry-run";
	run("pnpm", ["--dir", "ts", "--filter", "@nseng-ai/ns", "run", script], { cwd: repoRoot });
}
