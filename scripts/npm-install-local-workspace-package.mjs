#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function usage() {
  console.log(`Usage:
  node scripts/npm-install-local-workspace-package.mjs \\
    --target <repo> \\
    --package <path-or-package-name> \\
    [--ns-worktree <path>]

Packs a local ns workspace package and installs the resulting .tgz into a target repo
through npm. This is the local-filesystem equivalent of installing a published package:
npm sees a tarball, package.json files/exports/bin are honored, and package-lock records
a file: tarball dependency.

Options:
  --target <repo>        Target project/repo that should receive npm install. Required.
  --package <value>      Local package directory, or workspace package name such as
                         @nseng-ai/objectives. Required.
  --ns-worktree <path>   ns repo/worktree used to resolve package names. Defaults to cwd.
  --save-dev             Install as dev dependency. Default.
  --save-prod            Install as production dependency instead of dev dependency.
  --pack-dir <path>      Directory for generated tarballs.
                         Default: <ns-worktree>/tmp/local-npm-packs
  --force-pack-dir       Remove --pack-dir before packing.
  --skip-pack-script     Use npm pack on the package dir directly, even if pack:local exists.
  -h, --help             Show this help.

Examples:
  # Install local objectives into a throwaway repo via npm tarball semantics.
  node scripts/npm-install-local-workspace-package.mjs \\
    --ns-worktree /Users/schrockn/code/ns \\
    --target /Users/schrockn/code/scratch/install-obj-1 \\
    --package @nseng-ai/objectives

  # Same, by explicit package path.
  node scripts/npm-install-local-workspace-package.mjs \\
    --target /Users/schrockn/code/scratch/install-obj-1 \\
    --package /Users/schrockn/code/ns/ts/packages/capabilities/objectives
`);
}

function parseArgs(argv) {
  const options = {
    target: undefined,
    packageRef: undefined,
    nsWorktree: process.cwd(),
    saveDev: true,
    packDir: undefined,
    forcePackDir: false,
    skipPackScript: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--save-dev") {
      options.saveDev = true;
      continue;
    }
    if (arg === "--save-prod") {
      options.saveDev = false;
      continue;
    }
    if (arg === "--force-pack-dir") {
      options.forcePackDir = true;
      continue;
    }
    if (arg === "--skip-pack-script") {
      options.skipPackScript = true;
      continue;
    }
    if (arg === "--target") {
      options.target = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--package") {
      options.packageRef = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--ns-worktree") {
      options.nsWorktree = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--pack-dir") {
      options.packDir = requireValue(argv, ++index, arg);
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  if (options.target === undefined) fail("Missing required --target <repo>.");
  if (options.packageRef === undefined) fail("Missing required --package <path-or-package-name>.");

  options.target = path.resolve(expandHome(options.target));
  options.nsWorktree = path.resolve(expandHome(options.nsWorktree));
  options.packDir = path.resolve(
    expandHome(options.packDir ?? path.join(options.nsWorktree, "tmp", "local-npm-packs")),
  );
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) fail(`Missing value for ${flag}.`);
  return value;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  return execFileSync(command, args, {
    cwd: options.cwd,
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
    env: process.env,
    encoding: options.capture ? "utf8" : undefined,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function resolvePackageDir(nsWorktree, packageRef) {
  const expanded = path.resolve(expandHome(packageRef));
  if (existsSync(path.join(expanded, "package.json"))) return expanded;

  const packagesRoot = path.join(nsWorktree, "ts", "packages");
  if (!existsSync(packagesRoot)) {
    fail(`Cannot resolve package name without packages root: ${packagesRoot}`);
  }

  const matches = [];
  collectPackageDirs(packagesRoot, matches, 0);
  for (const packageDir of matches) {
    const packageJson = readJson(path.join(packageDir, "package.json"));
    if (packageJson.name === packageRef) return packageDir;
  }

  fail(`Could not resolve package ${packageRef} under ${packagesRoot}.`);
}

function collectPackageDirs(current, matches, depth) {
  if (depth > 4) return;
  const packageJsonPath = path.join(current, "package.json");
  if (existsSync(packageJsonPath)) {
    matches.push(current);
    return;
  }
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === "dist") continue;
    collectPackageDirs(path.join(current, entry.name), matches, depth + 1);
  }
}

function newestTarball(packDir, sinceMs) {
  const tarballs = readdirSync(packDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tgz"))
    .map((entry) => path.join(packDir, entry.name));
  if (tarballs.length === 0) fail(`No .tgz generated in ${packDir}.`);
  tarballs.sort((left, right) => {
    const leftStat = statMtimeMs(left);
    const rightStat = statMtimeMs(right);
    return rightStat - leftStat;
  });
  const newest = tarballs[0];
  if (statMtimeMs(newest) + 1000 < sinceMs) {
    fail(`Newest tarball in ${packDir} appears stale: ${newest}`);
  }
  return newest;
}

function statMtimeMs(filePath) {
  return statSync(filePath).mtimeMs;
}

const options = parseArgs(process.argv.slice(2));
if (!existsSync(path.join(options.target, "package.json"))) {
  fail(`Target must contain package.json. Run npm init first: ${options.target}`);
}

const packageDir = resolvePackageDir(options.nsWorktree, options.packageRef);
const packageJson = readJson(path.join(packageDir, "package.json"));
const packScript = packageJson.scripts?.["pack:local"];

if (options.forcePackDir && existsSync(options.packDir)) {
  rmSync(options.packDir, { recursive: true, force: true });
}
mkdirSync(options.packDir, { recursive: true });

const sinceMs = Date.now();
if (packScript !== undefined && !options.skipPackScript) {
  run("pnpm", ["--dir", path.join(options.nsWorktree, "ts"), "--filter", packageJson.name, "run", "pack:local"], {
    cwd: options.nsWorktree,
  });
  const packageDist = path.join(packageDir, "dist");
  const generated = newestTarball(packageDist, sinceMs);
  const tarballName = path.basename(generated);
  const destination = path.join(options.packDir, tarballName);
  rmSync(destination, { force: true });
  copyFileSync(generated, destination);
} else {
  run("npm", ["pack", packageDir, "--pack-destination", options.packDir], { cwd: options.nsWorktree });
}

const tarball = newestTarball(options.packDir, sinceMs);
const installArgs = ["install", options.saveDev ? "--save-dev" : "--save", tarball];
run("npm", installArgs, { cwd: options.target });

console.log(`\nInstalled ${packageJson.name}@${packageJson.version} into ${options.target}`);
console.log(`Tarball: ${tarball}`);
