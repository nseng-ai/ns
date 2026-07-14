#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import {
	assertCoordinatedVersion,
	assertPlausibleNpmVersion,
	buildPublishPlan,
	loadPublicPackageContext,
	printPublishPlan,
	repoRoot,
	run,
} from "./public-package-set.mjs";
import { isMissingPackageResult, snippet } from "./public-package-helpers.mjs";

const args = parseArgs(process.argv.slice(2));
assertPlausibleNpmVersion(args.version);

const context = await loadPublicPackageContext();
assertCoordinatedVersion(context, args.version);
const plan = buildPublishPlan(context, args.version);

if (args.mode === "dry-run") {
	printPublishPlan(plan);
	runQualification(args.version);
	console.log("publish-dry-run completed without registry writes.");
} else {
	assertCleanWorktree();
	runQualification(args.version);
	await assertUnpublished(plan, args.version);
	printPublishPlan(plan);
	console.log("");
	console.log("This legacy direct publisher cannot resume a partial publication. Use just release VERSION for new transactional releases with verified exact resume.");
	await confirmPublish(args.version);
	for (const item of plan) {
		run("npm", ["publish", item.publishRoot, "--access", "public"], { cwd: repoRoot });
	}
	await verifyPublishedPackagesWithRetry(args.version, args.verifyDelaysMs);
	console.log(`Published and strictly verified ${plan.length} public package(s) at ${args.version}.`);
}

function parseArgs(rawArgs) {
	const args = rawArgs.filter((arg) => arg !== "--");
	if (args.length < 2 || !["dry-run", "publish"].includes(args[0])) {
		throw new Error("Usage: pnpm --dir ts run release:publish / release:publish-dry-run -- <dry-run|publish> <version> [--verify-delay-ms <ms> ...]");
	}
	const customVerifyDelaysMs = [];
	for (let index = 2; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--verify-delay-ms") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-")) throw new Error("--verify-delay-ms requires a non-negative millisecond value");
			customVerifyDelaysMs.push(parseNonNegativeInteger(value, "--verify-delay-ms"));
			index += 1;
			continue;
		}
		if (arg === "--verify-delay-seconds") {
			const value = args[index + 1];
			if (value === undefined || value.startsWith("-")) throw new Error("--verify-delay-seconds requires a non-negative second value");
			customVerifyDelaysMs.push(parseNonNegativeInteger(value, "--verify-delay-seconds") * 1000);
			index += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}
	return { mode: args[0], version: args[1], verifyDelaysMs: customVerifyDelaysMs.length === 0 ? defaultVerifyDelaysMs() : customVerifyDelaysMs };
}

function runQualification(version) {
	run("pnpm", ["--dir", "ts", "run", "release:qualify-public", "--", "--all", "--version", version], { cwd: repoRoot });
}

function assertCleanWorktree() {
	const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
	if (status.status !== 0) throw new Error(status.stderr.trim() || "git status --porcelain failed");
	if (status.stdout.trim().length > 0) {
		throw new Error("Real publish requires a clean git worktree. Commit, stash, or revert local changes before running just publish VERSION.");
	}
}

async function assertUnpublished(plan, version) {
	const published = [];
	const errors = [];
	for (const item of plan) {
		const npmView = spawnSync("npm", ["view", `${item.packageName}@${version}`, "version", "--json"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		if (npmView.status === 0) {
			published.push(item.packageName);
			continue;
		}
		if (isMissingPackageResult(npmView.stderr, npmView.stdout)) continue;
		errors.push(`${item.packageName}: ${snippet(`${npmView.stderr}\n${npmView.stdout}`)}`);
	}
	if (published.length > 0) {
		throw new Error(`Refusing to publish because these package versions already exist at ${version}:\n- ${published.join("\n- ")}`);
	}
	if (errors.length > 0) {
		throw new Error(`Registry precheck failed for ${version}:\n- ${errors.join("\n- ")}`);
	}
	console.log(`Registry precheck: no intended public package is already published at ${version}.`);
}

async function confirmPublish(version) {
	if (!process.stdin.isTTY) {
		throw new Error(`Refusing to publish non-interactively. Re-run from a TTY and type: publish ${version}`);
	}
	const readline = createInterface({ input: process.stdin, output: process.stderr });
	try {
		const answer = await readline.question(`Type "publish ${version}" to publish ${version} to npm: `);
		if (answer !== `publish ${version}`) throw new Error("Publish confirmation did not match; no registry writes performed.");
	} finally {
		readline.close();
	}
}

async function verifyPublishedPackagesWithRetry(version, delaysMs) {
	const verifyArgs = ["--dir", "ts", "run", "release:verify-public", "--", "--version", version, "--strict"];
	const attempts = delaysMs.length + 1;
	let lastResult;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		console.log(`Registry verification attempt ${attempt}/${attempts} for ${version}`);
		lastResult = spawnSync("pnpm", verifyArgs, { cwd: repoRoot, encoding: "utf8" });
		printCapturedCommandOutput(lastResult);
		if (lastResult.status === 0) return;
		const nextDelayMs = delaysMs[attempt - 1];
		if (nextDelayMs === undefined) break;
		console.log(
			`Registry verification did not pass yet; waiting ${formatDelay(nextDelayMs)} for npm registry propagation before retrying.`,
		);
		await sleep(nextDelayMs);
	}
	const status = lastResult?.status ?? "unknown";
	throw new Error(
		`Published packages, but strict registry verification did not pass after ${attempts} attempt(s). `
			+ `This can still be npm propagation delay; rerun: pnpm --dir ts run release:verify-public -- --version ${version} --strict. `
			+ `Last verifier exit: ${status}`,
	);
}

function printCapturedCommandOutput(result) {
	if (result.stdout.length > 0) process.stdout.write(result.stdout);
	if (result.stderr.length > 0) process.stderr.write(result.stderr);
}

function defaultVerifyDelaysMs() {
	return [10_000, 20_000, 30_000, 60_000, 120_000, 120_000, 120_000, 120_000, 120_000];
}

function parseNonNegativeInteger(value, label) {
	if (!/^\d+$/.test(value)) throw new Error(`${label} must be a non-negative integer, got: ${value}`);
	return Number(value);
}

function sleep(delayMs) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs));
}

function formatDelay(delayMs) {
	if (delayMs % 1000 !== 0) return `${delayMs}ms`;
	return `${delayMs / 1000}s`;
}

