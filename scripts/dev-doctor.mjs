#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: node scripts/dev-doctor.mjs [--full] [--strict]

Read-only checks for the ns development lifecycle.

  --full    Also run the repository's full local validation lanes
  --strict  Treat warnings as a failing exit status
  -h        Show this help

The default checks do not install, authenticate, or modify anything.`);
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => !["--full", "--strict"].includes(arg));
if (unknownArgs.length > 0) {
  console.error(`Unknown option: ${unknownArgs.join(", ")}`);
  process.exit(2);
}

function run(command, commandArgs = [], options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
    timeout: options.timeout ?? 30_000,
  });
}

function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function firstLine(result) {
  return (
    output(result)
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? ""
  );
}

function findRepoRoot() {
  const result = run("git", ["rev-parse", "--show-toplevel"]);
  if (result.status !== 0) return null;
  const root = result.stdout.trim();
  return existsSync(path.join(root, "ts", "package.json")) &&
    existsSync(path.join(root, "justfile"))
    ? root
    : null;
}

const repoRoot = findRepoRoot();
if (repoRoot === null) {
  console.error("FAIL  Run this command from inside the ns repository.");
  process.exit(1);
}

const tsPackage = JSON.parse(readFileSync(path.join(repoRoot, "ts", "package.json"), "utf8"));
const expectedPnpm = String(tsPackage.packageManager ?? "pnpm@11.8.0")
  .split("@")
  .at(-1);
const minimumNode = String(tsPackage.engines?.node ?? ">=24.12.0").replace(/^>=/, "");
const recommendations = new Set();
let passCount = 0;
let warningCount = 0;
let failureCount = 0;

function pass(label, detail = "") {
  passCount += 1;
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}

function warn(label, detail = "", recommendation) {
  warningCount += 1;
  console.log(`WARN  ${label}${detail ? ` — ${detail}` : ""}`);
  if (recommendation) recommendations.add(recommendation);
}

function fail(label, detail = "", recommendation) {
  failureCount += 1;
  console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  if (recommendation) recommendations.add(recommendation);
}

function section(title) {
  console.log(`\n${title}`);
}

function commandPath(command) {
  const result = run("sh", ["-c", `command -v ${command}`]);
  return result.status === 0 ? result.stdout.trim() : null;
}

function checkCommand(command, versionArgs, options = {}) {
  const resolved = commandPath(command);
  if (resolved === null) {
    const reporter = options.required === false ? warn : fail;
    reporter(`${command} installed`, "not found on PATH", options.recommendation);
    return null;
  }

  const result = run(command, versionArgs);
  if (result.status !== 0) {
    fail(`${command} runs`, firstLine(result) || `exit ${result.status}`, options.recommendation);
    return null;
  }
  pass(`${command} installed`, `${firstLine(result)} (${resolved})`);
  return firstLine(result);
}

function numericVersion(value) {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  return match?.slice(1).map(Number) ?? null;
}

function versionAtLeast(actual, minimum) {
  const a = numericVersion(actual);
  const b = numericVersion(minimum);
  if (a === null || b === null) return false;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return true;
    if (a[index] < b[index]) return false;
  }
  return true;
}

console.log(
  `ns development doctor\nrepo: ${repoRoot}\nplatform: ${process.platform}/${process.arch}`,
);

section("Runtime");
const nodeVersion = process.version;
if (versionAtLeast(nodeVersion, minimumNode)) {
  pass("Node version", `${nodeVersion}; requires ${tsPackage.engines.node}`);
} else {
  fail(
    "Node version",
    `${nodeVersion}; requires ${tsPackage.engines.node}`,
    `Use a Node ${minimumNode} or newer runtime (the Devbox config uses node24).`,
  );
}
checkCommand("corepack", ["--version"], {
  recommendation: "Install/enable Corepack for the Node runtime.",
});
checkCommand("pnpm", ["--version"], {
  required: false,
  recommendation: `Use the repository-pinned invocation: corepack pnpm@${expectedPnpm}`,
});
const pinnedPnpm = run("corepack", [`pnpm@${expectedPnpm}`, "--version"]);
if (pinnedPnpm.status === 0 && firstLine(pinnedPnpm) === expectedPnpm) {
  pass("repository-pinned pnpm", expectedPnpm);
} else {
  fail(
    "repository-pinned pnpm",
    firstLine(pinnedPnpm) || `could not run pnpm ${expectedPnpm} through Corepack`,
    `Run: corepack pnpm@${expectedPnpm} --version`,
  );
}

section("Repository workspace");
const modulesManifest = path.join(repoRoot, "ts", "node_modules", ".modules.yaml");
if (existsSync(modulesManifest)) {
  pass("pnpm workspace installed", "ts/node_modules/.modules.yaml exists");
} else {
  fail(
    "pnpm workspace installed",
    "ts/node_modules is not ready",
    `Run: corepack pnpm@${expectedPnpm} --config.strict-dep-builds=false --dir "${repoRoot}/ts" install --frozen-lockfile`,
  );
}

const workspaceBinaries = new Map([
  ["tsc", path.join(repoRoot, "ts", "node_modules", ".bin", "tsc")],
  ["vitest", path.join(repoRoot, "ts", "node_modules", ".bin", "vitest")],
  ["oxfmt", path.join(repoRoot, "ts", "node_modules", ".bin", "oxfmt")],
  ["oxlint", path.join(repoRoot, "ts", "node_modules", ".bin", "oxlint")],
  ["gt", path.join(repoRoot, "ts", "node_modules", ".bin", "gt")],
  ["pi", path.join(repoRoot, "ts", "packages", "public", "ns", "node_modules", ".bin", "pi")],
]);
for (const [binary, workspaceBinary] of workspaceBinaries) {
  if (existsSync(workspaceBinary)) {
    pass(`workspace ${binary}`, workspaceBinary);
  } else {
    fail(
      `workspace ${binary}`,
      "missing",
      `Run: corepack pnpm@${expectedPnpm} --config.strict-dep-builds=false --dir "${repoRoot}/ts" install --frozen-lockfile`,
    );
  }
}

section("Repository and system tools");
checkCommand("git", ["--version"], { recommendation: "Install git." });
checkCommand("just", ["--version"], {
  recommendation: `Run: mkdir -p "$HOME/.local/bin" && ln -sf "${repoRoot}/.github/bin/just" "$HOME/.local/bin/just"`,
});
checkCommand("dprint", ["--version"], {
  recommendation:
    "Run: curl -fsSL https://dprint.dev/install.sh | sh -s 0.55.2, then add $HOME/.dprint/bin to PATH.",
});
checkCommand("uv", ["--version"], {
  recommendation: "Run: curl -LsSf https://astral.sh/uv/install.sh | sh",
});
checkCommand("herdr", ["--version"], {
  recommendation: "Run: curl -fsSL https://herdr.dev/install.sh | sh",
});
checkCommand("gh", ["--version"], { recommendation: "Install the GitHub CLI (gh)." });
const systemToolVersionArgs = new Map([
  ["jq", ["--version"]],
  ["rg", ["--version"]],
  ["curl", ["--version"]],
  ["unzip", ["-v"]],
  ["make", ["--version"]],
  ["gcc", ["--version"]],
  ["g++", ["--version"]],
]);
for (const [binary, versionArgs] of systemToolVersionArgs) {
  checkCommand(binary, versionArgs, {
    recommendation: `Install ${binary} with the box's system package manager.`,
  });
}
checkCommand("direnv", ["version"], {
  required: false,
  recommendation:
    "Install direnv and run `direnv allow` in the repository (recommended for interactive shells).",
});

section("ns source tools");
for (const tool of ["ns", "brmem", "vibechk", "packagechk"]) {
  const resolved = commandPath(tool);
  if (resolved === null) {
    fail(`${tool} source shim`, "not found on PATH", `Run from ${repoRoot}: just install-tools`);
    continue;
  }
  const result = run(tool, ["--version"], { cwd: repoRoot });
  if (result.status === 0) {
    pass(`${tool} source shim`, `${firstLine(result)} (${resolved})`);
  } else {
    fail(
      `${tool} source shim`,
      firstLine(result) || `exit ${result.status}`,
      `Run from ${repoRoot}: just install-tools`,
    );
  }
}

section("Git and publication configuration");
const identityName = run("git", ["config", "--get", "user.name"], { cwd: repoRoot });
const identityEmail = run("git", ["config", "--get", "user.email"], { cwd: repoRoot });
if (identityName.status === 0 && identityEmail.status === 0) {
  pass("Git identity", `${identityName.stdout.trim()} <${identityEmail.stdout.trim()}>`);
} else {
  fail(
    "Git identity",
    "user.name or user.email is missing",
    "Configure git user.name and user.email.",
  );
}

const signingEnabled = run("git", ["config", "--bool", "--get", "commit.gpgsign"], {
  cwd: repoRoot,
});
const signingFormat = run("git", ["config", "--get", "gpg.format"], { cwd: repoRoot });
const signingKey = run("git", ["config", "--get", "user.signingkey"], { cwd: repoRoot });
if (
  signingEnabled.status === 0 &&
  signingEnabled.stdout.trim() === "true" &&
  signingFormat.status === 0 &&
  signingFormat.stdout.trim() === "ssh" &&
  signingKey.status === 0
) {
  pass("Git SSH commit signing", `enabled; key ${signingKey.stdout.trim()}`);
} else {
  fail(
    "Git SSH commit signing",
    "commit.gpgsign=true, gpg.format=ssh, and user.signingkey are required",
    "Configure SSH commit signing locally, then reconnect so Devbox forwards the configuration and SSH agent.",
  );
}

if (process.env.SSH_AUTH_SOCK) {
  const agentKeys = run("ssh-add", ["-L"]);
  if (agentKeys.status === 0 && agentKeys.stdout.trim() !== "") {
    pass("forwarded SSH agent", "at least one public key is available");
  } else {
    fail(
      "forwarded SSH agent",
      "SSH_AUTH_SOCK is set but no key is available",
      "Load the signing key into the local SSH agent and reconnect to the Devbox.",
    );
  }
} else {
  fail(
    "forwarded SSH agent",
    "SSH_AUTH_SOCK is unset",
    "Reconnect with Devbox SSH agent forwarding enabled.",
  );
}

const ghAuth = run("gh", ["auth", "status", "--active", "--hostname", "github.com"]);
if (ghAuth.status === 0) {
  pass("GitHub authentication", "gh is authenticated to github.com");
} else {
  fail(
    "GitHub authentication",
    "gh auth status failed",
    "Forward GH_TOKEN through Devbox or run `gh auth login` interactively.",
  );
}

const graphite = run("gt", ["branch", "info", "--no-interactive"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    PATH: `${path.join(repoRoot, "ts", "node_modules", ".bin")}:${process.env.PATH ?? ""}`,
  },
});
if (graphite.status === 0) {
  pass("Graphite repository", "gt can inspect the current repository");
  warn(
    "Graphite API authentication",
    "not probed because a reliable probe may contact or mutate the service",
    "Before first publication, run `gt submit --dry-run --no-interactive`; if asked, authenticate with `gt auth`.",
  );
} else {
  fail(
    "Graphite repository",
    firstLine(graphite) || "gt branch info failed",
    "Ensure workspace dependencies are installed and initialize/track the repository with Graphite.",
  );
}

section("Project-local configuration");
const envLocal = path.join(repoRoot, ".env.local");
if (existsSync(envLocal)) {
  pass(".env.local", "present (contents not inspected)");
} else {
  warn(
    ".env.local",
    "missing; ns.toml declares it as Slot-provisioned local state",
    "Mount/provision .env.local into the box; never bake secrets into a snapshot.",
  );
}

const envrc = path.join(repoRoot, ".envrc");
if (existsSync(envrc)) {
  pass(".envrc", "present");
  if (commandPath("direnv") !== null) {
    const direnvStatus = run("direnv", ["status"], { cwd: repoRoot });
    if (direnvStatus.status === 0 && output(direnvStatus).includes("Loaded RC allowed 0")) {
      pass("direnv authorization", ".envrc is allowed");
    } else {
      warn(
        "direnv authorization",
        ".envrc is not currently loaded/allowed",
        `Run from ${repoRoot}: direnv allow`,
      );
    }
  }
}

const requiredPathEntries = [
  path.join(homedir(), ".local", "bin"),
  path.join(repoRoot, "ts", "node_modules", ".bin"),
  path.join(repoRoot, "ts", "packages", "public", "ns", "node_modules", ".bin"),
];
const actualPathEntries = (process.env.PATH ?? "").split(path.delimiter).map((entry) => {
  try {
    return existsSync(entry) ? realpathSync(entry) : entry;
  } catch {
    return entry;
  }
});
for (const entry of requiredPathEntries) {
  let normalized = entry;
  try {
    normalized = existsSync(entry) ? realpathSync(entry) : entry;
  } catch {
    // Keep the unresolved path for the diagnostic.
  }
  if (actualPathEntries.includes(normalized)) {
    pass("PATH entry", entry);
  } else {
    warn(
      "PATH entry",
      `${entry} is missing`,
      `Add to your shell profile: export PATH="${path.join(repoRoot, "ts", "packages", "public", "ns", "node_modules", ".bin")}:${path.join(repoRoot, "ts", "node_modules", ".bin")}:$HOME/.local/bin:$PATH"`,
    );
  }
}

if (args.has("--full")) {
  section("Full lifecycle validation");
  const validations = [
    ["CI-equivalent validation", ["ci"]],
    ["isolated tests", ["ts-test-isolated"]],
  ];
  for (const [label, validationArgs] of validations) {
    console.log(`RUN   ${label} — just ${validationArgs.join(" ")}`);
    const result = run("just", validationArgs, {
      cwd: repoRoot,
      inherit: true,
      timeout: 30 * 60_000,
    });
    if (result.status === 0) pass(label);
    else {
      fail(
        label,
        `just exited ${result.status ?? "without an exit code"}`,
        `Fix the failing just ${validationArgs.join(" ")} gate and rerun this doctor.`,
      );
    }
  }
}

section("Summary");
console.log(`${passCount} passed, ${warningCount} warnings, ${failureCount} failures`);
if (recommendations.size > 0) {
  console.log("\nRecommended actions:");
  let index = 1;
  for (const recommendation of recommendations) {
    console.log(`${index}. ${recommendation}`);
    index += 1;
  }
}

if (failureCount > 0 || (args.has("--strict") && warningCount > 0)) process.exit(1);
