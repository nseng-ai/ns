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
	await assertUnpublished(args.version);
	printPublishPlan(plan);
	console.log("");
	console.log("If publishing fails after some packages are published, rerunning this command at the same version will fail the already-published precheck. Choose a new version or build an explicit future resume mode.");
	await confirmPublish(args.version);
	for (const item of plan) {
		run("npm", ["publish", item.publishRoot, "--access", "public"], { cwd: repoRoot });
	}
	run("pnpm", ["--dir", "ts", "run", "release:verify-public", "--", "--version", args.version, "--strict"], { cwd: repoRoot });
	console.log(`Published and strictly verified ${plan.length} public package(s) at ${args.version}.`);
}

function parseArgs(rawArgs) {
	const args = rawArgs.filter((arg) => arg !== "--");
	if (args.length !== 2 || !["dry-run", "publish"].includes(args[0])) {
		throw new Error("Usage: pnpm --dir ts run release:publish-public -- <dry-run|publish> <version>");
	}
	return { mode: args[0], version: args[1] };
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

async function assertUnpublished(version) {
	const published = [];
	const errors = [];
	for (const item of buildPublishPlan(context, version)) {
		const npmView = spawnSync("npm", ["view", `${item.packageName}@${version}`, "version", "--json"], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		if (npmView.status === 0) {
			published.push(item.packageName);
			continue;
		}
		const text = `${npmView.stderr}\n${npmView.stdout}`;
		if (isMissingPackageResult(text)) continue;
		errors.push(`${item.packageName}: ${snippet(text)}`);
	}
	if (published.length > 0) {
		throw new Error(`Refusing to publish because these package versions already exist at ${version}:\n- ${published.join("\n- ")}`);
	}
	if (errors.length > 0) {
		throw new Error(`Registry precheck failed for ${version}:\n- ${errors.join("\n- ")}`);
	}
	console.log(`Registry precheck: no intended public package is already published at ${version}.`);
}

function isMissingPackageResult(text) {
	return text.includes("E404") || text.includes("404 Not Found") || text.includes("is not in this registry");
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

function snippet(value) {
	const oneLine = value.replaceAll("\n", " ").trim();
	return oneLine.length > 240 ? `${oneLine.slice(0, 237)}...` : oneLine;
}
