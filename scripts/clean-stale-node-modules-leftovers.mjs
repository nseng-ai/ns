#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { rmSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const allowedJunkNames = new Set([".DS_Store"]);

function usage() {
  return `Usage: node scripts/clean-stale-node-modules-leftovers.mjs [--apply] [--verbose]

Safely removes stale untracked package directories under ts/packages whose only
meaningful direct content is an ignored node_modules directory.

Default mode is dry-run. Pass --apply to delete candidates and prune empty
untracked parent containers under ts/packages.`;
}

function parseArgs(argv) {
  const options = { apply: false, verbose: false };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--verbose") {
      options.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
    }
  }

  return options;
}

function runGit(args, { allowExitCodes = [0] } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowExitCodes.includes(result.status ?? 1)) {
    const stderr = result.stderr.trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }

  return result;
}

function repoRelative(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

function displayPath(absPath) {
  return repoRelative(absPath);
}

function isWithinScanRoot(absPath) {
  const relative = path.relative(scanRoot, absPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function hasTrackedFiles(absPath) {
  const result = runGit(["ls-files", "--", repoRelative(absPath)]);
  return result.stdout.trim().length > 0;
}

function isGitIgnored(absPath) {
  const result = runGit(["check-ignore", "-q", "--", repoRelative(absPath)], {
    allowExitCodes: [0, 1],
  });
  return result.status === 0;
}

function safeReadDir(absPath) {
  return readdirSync(absPath, { withFileTypes: true });
}

function hasDirectNodeModules(entries) {
  return entries.some((entry) => entry.name === "node_modules" && entry.isDirectory());
}

function directEntrySafety(entries) {
  const unsafe = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" && entry.isDirectory()) {
      continue;
    }

    if (allowedJunkNames.has(entry.name)) {
      continue;
    }

    unsafe.push(entry.name);
  }

  if (unsafe.length > 0) {
    return {
      ok: false,
      reason: `contains direct non-node_modules entries: ${unsafe.sort().join(", ")}`,
    };
  }

  return { ok: true };
}

function staleLeafStatus(absPath) {
  if (path.resolve(absPath) === scanRoot) {
    return { ok: false, reason: "scan root is never a deletion candidate" };
  }

  if (!isWithinScanRoot(absPath)) {
    return { ok: false, reason: "outside ts/packages scan root" };
  }

  const stats = statSync(absPath, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    return { ok: false, reason: "not a directory" };
  }

  const entries = safeReadDir(absPath);
  if (!hasDirectNodeModules(entries)) {
    return { ok: false, reason: "no direct node_modules directory" };
  }

  if (hasTrackedFiles(absPath)) {
    return { ok: false, reason: "contains tracked files" };
  }

  const entrySafety = directEntrySafety(entries);
  if (!entrySafety.ok) {
    return entrySafety;
  }

  const nodeModulesPath = path.join(absPath, "node_modules");
  if (!isGitIgnored(nodeModulesPath)) {
    return { ok: false, reason: "direct node_modules is not ignored by Git" };
  }

  return { ok: true };
}

function walkDirectories(absPath, results = []) {
  const entries = safeReadDir(absPath);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const child = path.join(absPath, entry.name);
    if (entry.name === "node_modules") {
      continue;
    }

    results.push(child);
    walkDirectories(child, results);
  }

  return results;
}

function compareDeepestFirst(left, right) {
  const rightDepth = right.split(path.sep).length;
  const leftDepth = left.split(path.sep).length;
  return rightDepth - leftDepth || displayPath(left).localeCompare(displayPath(right));
}

function compareShallowestFirst(left, right) {
  const leftDepth = left.split(path.sep).length;
  const rightDepth = right.split(path.sep).length;
  return leftDepth - rightDepth || displayPath(left).localeCompare(displayPath(right));
}

function findStaleLeaves() {
  const staleLeaves = [];
  const skippedWithNodeModules = [];

  for (const absPath of walkDirectories(scanRoot)) {
    const entries = safeReadDir(absPath);
    if (!hasDirectNodeModules(entries)) {
      continue;
    }

    const status = staleLeafStatus(absPath);
    if (status.ok) {
      staleLeaves.push(absPath);
    } else {
      skippedWithNodeModules.push({ absPath, reason: status.reason });
    }
  }

  return {
    staleLeaves: staleLeaves.sort(compareDeepestFirst),
    skippedWithNodeModules: skippedWithNodeModules.sort((left, right) =>
      displayPath(left.absPath).localeCompare(displayPath(right.absPath))
    ),
  };
}

function parentCanBePrunedVirtually(absPath, plannedRemoved) {
  if (path.resolve(absPath) === scanRoot || !isWithinScanRoot(absPath)) {
    return false;
  }

  if (hasTrackedFiles(absPath)) {
    return false;
  }

  const entries = safeReadDir(absPath);
  return entries.every((entry) => {
    if (allowedJunkNames.has(entry.name)) {
      return true;
    }

    return plannedRemoved.has(path.join(absPath, entry.name));
  });
}

function planParentPrunes(staleLeaves) {
  const plannedRemoved = new Set(staleLeaves);
  const parentPrunes = new Set();

  for (const leaf of staleLeaves) {
    let current = path.dirname(leaf);

    while (path.resolve(current) !== scanRoot && isWithinScanRoot(current)) {
      if (!parentCanBePrunedVirtually(current, plannedRemoved)) {
        break;
      }

      parentPrunes.add(current);
      plannedRemoved.add(current);
      current = path.dirname(current);
    }
  }

  return Array.from(parentPrunes).sort(compareDeepestFirst);
}

function parentCanBePrunedNow(absPath) {
  if (path.resolve(absPath) === scanRoot || !isWithinScanRoot(absPath)) {
    return false;
  }

  const stats = statSync(absPath, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    return false;
  }

  if (hasTrackedFiles(absPath)) {
    return false;
  }

  const entries = safeReadDir(absPath);
  return entries.every((entry) => allowedJunkNames.has(entry.name));
}

function printPlan({ mode, staleLeaves, parentPrunes, skippedWithNodeModules, verbose }) {
  console.log(`Mode: ${mode}`);
  console.log(`Scan root: ${repoRelative(scanRoot)}`);

  if (staleLeaves.length === 0) {
    console.log("No stale node_modules-only directories found under ts/packages.");
  } else {
    const action = mode === "apply" ? "Removing stale leaf directories:" : "Stale leaf directories that would be removed:";
    console.log(`\n${action}`);
    for (const leaf of staleLeaves) {
      console.log(`  - ${displayPath(leaf)}`);
    }
  }

  if (parentPrunes.length > 0) {
    const action = mode === "apply" ? "Pruning empty untracked parent containers:" : "Parent containers that would be pruned after leaf removal:";
    console.log(`\n${action}`);
    for (const parent of parentPrunes.sort(compareShallowestFirst)) {
      console.log(`  - ${displayPath(parent)}`);
    }
  }

  if (verbose && skippedWithNodeModules.length > 0) {
    console.log("\nDirectories with direct node_modules that were skipped:");
    for (const skipped of skippedWithNodeModules) {
      console.log(`  - ${displayPath(skipped.absPath)} (${skipped.reason})`);
    }
  }
}

function applyCleanup(staleLeaves) {
  const deletedLeaves = [];

  for (const leaf of staleLeaves) {
    const status = staleLeafStatus(leaf);
    if (!status.ok) {
      throw new Error(`Refusing to remove ${displayPath(leaf)}: ${status.reason}`);
    }

    rmSync(leaf, { recursive: true, force: false });
    deletedLeaves.push(leaf);
  }

  const prunedParents = new Set();
  for (const leaf of deletedLeaves) {
    let current = path.dirname(leaf);

    while (path.resolve(current) !== scanRoot && isWithinScanRoot(current)) {
      if (prunedParents.has(current)) {
        current = path.dirname(current);
        continue;
      }

      if (!parentCanBePrunedNow(current)) {
        break;
      }

      rmSync(current, { recursive: true, force: false });
      prunedParents.add(current);
      current = path.dirname(current);
    }
  }

  return Array.from(prunedParents).sort(compareDeepestFirst);
}

let repoRoot;
let scanRoot;

try {
  const options = parseArgs(process.argv.slice(2));
  repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  process.chdir(repoRoot);
  scanRoot = path.join(repoRoot, "ts", "packages");

  const stats = statSync(scanRoot, { throwIfNoEntry: false });
  if (!stats?.isDirectory()) {
    throw new Error(`Expected scan root to exist: ${repoRelative(scanRoot)}`);
  }

  const { staleLeaves, skippedWithNodeModules } = findStaleLeaves();
  const plannedParentPrunes = planParentPrunes(staleLeaves);

  printPlan({
    mode: options.apply ? "apply" : "dry-run",
    staleLeaves,
    parentPrunes: plannedParentPrunes,
    skippedWithNodeModules,
    verbose: options.verbose,
  });

  if (options.apply) {
    const actualParentPrunes = applyCleanup(staleLeaves);
    if (staleLeaves.length > 0 || actualParentPrunes.length > 0) {
      console.log("\nCleanup complete.");
    }
  } else {
    console.log("\nDry-run only. Re-run with --apply to delete these directories.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
