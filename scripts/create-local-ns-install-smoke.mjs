#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

function usage() {
  console.log(`Usage:
  node scripts/create-local-ns-install-smoke.mjs --ns-worktree <path> [options]

Creates a fresh throwaway git repo, installs the local prepared @nseng-ai/ns package
from <ns-worktree>/ts/packages/hosts/ns-cli/dist/publish as a project-local dev
package, makes an initial commit, and verifies npx ns can run.

Options:
  --ns-worktree <path>   Path to the ns repo/worktree to install from. Required.
  --parent <path>        Parent directory for the new repo.
                         Default: ~/code/scratch/ns-integration-runs
  --name <name>          New repo folder name. Default: ns-local-install-<timestamp>
  --force                Remove the destination directory first if it already exists.
  --skip-verify          Do not run npx ns smoke commands after install.
  -h, --help             Show this help.

Example:
  node scripts/create-local-ns-install-smoke.mjs \\
    --ns-worktree /Users/schrockn/code/ns \\
    --name install-obj-1

After it succeeds:
  cd <printed-repo-path>
  npx ns init --harness claude-code
`);
}

function parseArgs(argv) {
  const options = {
    parent: path.join(os.homedir(), "code", "scratch", "ns-integration-runs"),
    name: undefined,
    nsWorktree: undefined,
    force: false,
    skipVerify: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--skip-verify") {
      options.skipVerify = true;
      continue;
    }
    if (arg === "--ns-worktree") {
      options.nsWorktree = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--parent") {
      options.parent = requireValue(argv, ++index, arg);
      continue;
    }
    if (arg === "--name") {
      options.name = requireValue(argv, ++index, arg);
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  if (options.nsWorktree === undefined) {
    fail("Missing required --ns-worktree <path>.");
  }

  options.nsWorktree = path.resolve(expandHome(options.nsWorktree));
  options.parent = path.resolve(expandHome(options.parent));
  options.name ??= `ns-local-install-${timestampForPath()}`;
  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    fail(`Missing value for ${flag}.`);
  }
  return value;
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function timestampForPath() {
  return new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  execFileSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: process.env,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

const options = parseArgs(process.argv.slice(2));
const publishDir = path.join(options.nsWorktree, "ts", "packages", "hosts", "ns-cli", "dist", "publish");
const publishPackageJson = path.join(publishDir, "package.json");
const destination = path.join(options.parent, options.name);

if (!existsSync(publishPackageJson)) {
  fail(`Prepared local package not found at ${publishPackageJson}. Run this first in the ns worktree: pnpm --dir ts --filter @nseng-ai/ns run pack:local`);
}

const packageInfo = readJson(publishPackageJson);
if (packageInfo.name !== "@nseng-ai/ns") {
  fail(`Expected ${publishPackageJson} to be @nseng-ai/ns, found ${packageInfo.name ?? "<missing>"}.`);
}

if (existsSync(destination)) {
  if (!options.force) {
    fail(`Destination already exists: ${destination}. Pass --force to remove it first.`);
  }
  rmSync(destination, { recursive: true, force: true });
}

mkdirSync(destination, { recursive: true });

writeFileSync(path.join(destination, "README.md"), `# ${options.name}\n\nLocal ns install smoke repo.\n`);

run("git", ["init", "-b", "main", "."], { cwd: destination });
run("npm", ["init", "-y"], { cwd: destination });
run("npm", ["install", "--save-dev", publishDir], { cwd: destination });
run("git", ["add", "README.md", "package.json", "package-lock.json"], { cwd: destination });
run("git", ["commit", "-m", "Initial commit"], { cwd: destination });

if (!options.skipVerify) {
  run("npx", ["ns", "--help"], { cwd: destination });
  run("npx", ["ns", "objective", "list"], { cwd: destination });
  run("npx", ["ns", "init", "--help"], { cwd: destination });
  run("npx", ["ns", "skills", "list"], { cwd: destination });
}

console.log(`\nReady: ${destination}`);
console.log("Next:");
console.log(`  cd ${destination}`);
console.log("  npx ns init --harness claude-code");
