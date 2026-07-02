#!/usr/bin/env node
// Extract the package and topology-circle dependency topology of a pnpm/npm
// workspace and emit the structural facts an architecture-topology report is
// built from.
//
// Packages are npm/workspace distribution units. Topology circles are package
// root/remainder circles plus subpackage circles declared in package manifests
// at sdl.subpackages. Edges are RUNTIME package manifest edges for the package
// graph and static TypeScript import/export edges for the circle graph.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, normalize, relative, resolve } from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const ROOT = arg("root", "ts/packages");
const KIT = arg("kit", "@sdl/capability-kit");

// The workspace's own TypeScript compiler, when installed, gives AST-grade
// import scanning (dynamic import(), multi-line forms, no matches inside
// strings/comments). Absent a resolvable compiler, fall back to the regex scan.
function loadWorkspaceTypescript() {
  try {
    return createRequire(resolve(ROOT, "package.json"))("typescript");
  } catch {
    return undefined;
  }
}
const workspaceTypescript = loadWorkspaceTypescript();
const API_NEEDLE = arg("api-needle", "api");
const SRC_DIR = arg("src-dir", "src");
const PRETTY = arg("pretty", false);
const OUT = arg("out", false);

// Canonical taxonomy — kept in sync with the workspace source of truth:
// ts/packages/infra/core/test/support/typescript-style-guard/config.ts
// (`packageTierValues`, `packageTierAllowedTargets`, `allowedPackageTierDebtEdges`).
const TIERS = [
  "capability",
  "capability-kit",
  "sdk",
  "neutral-infra",
  "host",
  "capability-pi",
  "standalone-tool",
  "local-pi-tool",
];
const TIER_SET = new Set(TIERS);
const TIER_POLICY = {
  capability: new Set(["capability", "capability-kit", "sdk", "neutral-infra"]),
  "capability-kit": new Set(["sdk", "neutral-infra"]),
  sdk: new Set(["sdk", "neutral-infra"]),
  "neutral-infra": new Set(["neutral-infra"]),
  host: new Set(["capability", "sdk", "capability-kit", "neutral-infra"]),
  "capability-pi": new Set(["capability-pi", "host", "capability", "capability-kit", "sdk", "neutral-infra"]),
  "standalone-tool": new Set(["standalone-tool", "host", "capability", "capability-kit", "sdk", "neutral-infra"]),
  "local-pi-tool": new Set(["local-pi-tool", "host", "neutral-infra"]),
};
const ALLOWED_DEBT_EDGES = new Map([
  ["@sdl/ccc\0@sdl/pi", "CCC clean-consumer debt tracked by the sdl-extension-architecture objective step 5."],
  ["@sdl/kernel\0@sdl/slot", "SDK-to-capability CLI mount debt: @sdl/kernel still mounts Slot directly."],
  [
    "@sdl/kernel\0@sdl/capability-kit",
    "SDK-to-capability-kit CLI shell-support debt: @sdl/kernel still reuses Capability Kit shell wrappers for the sdl shell operation.",
  ],
  [
    "@sdl/brmem\0@sdl/capability-kit",
    "Git gateway relocation debt: brmem still consumes the capability-kit git seam until neutral-infra gateway placement is finalized.",
  ],
  [
    "@sdl-local/pi-tools\0@sdl/capability-kit",
    "Local Pi tools container still reuses Capability Kit GitHub identity and text-repair helpers; resolve when local-pi-tool helper placement is settled.",
  ],
]);

function toPosix(path) {
  return path.split("\\").join("/");
}

function sourceFilePathsUnder(dir, options = {}) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const paths = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || options.rootOnly) continue;
      paths.push(...sourceFilePathsUnder(p, options));
    } else if (
      e.isFile() &&
      /\.(ts|tsx)$/.test(e.name) &&
      !/\.(test|spec)\.tsx?$/.test(e.name) &&
      !e.name.endsWith(".d.ts")
    ) {
      paths.push(p);
    }
  }
  return paths;
}

function countLocForFiles(files) {
  let loc = 0;
  for (const file of files) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("//")) loc++;
    }
  }
  return loc;
}

function countLoc(dir) {
  return countLocForFiles(sourceFilePathsUnder(dir));
}

let files;
try {
  files = execSync(
    `find ${JSON.stringify(ROOT)} -name package.json -not -path "*/node_modules/*"`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
} catch (e) {
  console.error(`Failed to scan ${ROOT}: ${e.message}`);
  process.exit(1);
}

const pkgs = {};
const manifests = {};
const manifestErrors = [];
for (const f of files) {
  let d;
  try {
    d = JSON.parse(readFileSync(f, "utf8"));
  } catch {
    continue;
  }
  if (!d.name) continue;
  const tier = d.sdl?.tier;
  if (typeof tier !== "string") {
    manifestErrors.push(`${d.name} (${f}) is missing sdl.tier; known tiers: ${TIERS.join(", ")}`);
  } else if (!TIER_SET.has(tier)) {
    manifestErrors.push(`${d.name} (${f}) has unknown sdl.tier ${JSON.stringify(tier)}; known tiers: ${TIERS.join(", ")}`);
  }
  const deps = {};
  for (const k of ["dependencies", "peerDependencies", "devDependencies"]) {
    for (const dep of Object.keys(d[k] || {})) {
      (deps[dep] = deps[dep] || new Set()).add(
        k === "devDependencies" ? "dev" : k === "peerDependencies" ? "peer" : "prod",
      );
    }
  }
  const path = f.replace(/\/package\.json$/, "");
  manifests[d.name] = d;
  pkgs[d.name] = {
    path,
    exports: Object.keys(d.exports || {}),
    tier,
    deps,
    loc: countLoc(join(path, SRC_DIR)),
  };
}

if (manifestErrors.length) {
  console.error(`Package tier declaration errors:\n${manifestErrors.map((error) => `  - ${error}`).join("\n")}`);
  process.exit(1);
}

const names = new Set(Object.keys(pkgs));

const graph = {};
for (const [name, p] of Object.entries(pkgs)) {
  const out = [];
  for (const [dep, kinds] of Object.entries(p.deps)) {
    if (!names.has(dep)) continue;
    if (kinds.has("prod") || kinds.has("peer")) out.push(dep);
  }
  graph[name] = [...new Set(out)].sort();
}

function findCycles(g) {
  let idx = 0;
  const stack = [], onstack = {}, index = {}, low = {}, sccs = [];
  function strongconnect(v) {
    index[v] = low[v] = idx++;
    stack.push(v);
    onstack[v] = true;
    for (const w of g[v] || []) {
      if (!(w in index)) {
        strongconnect(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onstack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onstack[w] = false;
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp.sort());
    }
  }
  for (const v of Object.keys(g)) if (!(v in index)) strongconnect(v);
  return sccs;
}

const cycles = findCycles(graph);

const fanOut = {}, fanIn = {};
for (const n of names) {
  fanOut[n] = 0;
  fanIn[n] = 0;
}
for (const [n, outs] of Object.entries(graph)) {
  fanOut[n] = outs.length;
  for (const t of outs) fanIn[t] = (fanIn[t] || 0) + 1;
}

function tierViolationForEdge(from, to) {
  const fromTier = pkgs[from]?.tier;
  const toTier = pkgs[to]?.tier;
  if (fromTier === undefined || toTier === undefined) return undefined;
  if (TIER_POLICY[fromTier]?.has(toTier)) return undefined;
  if (isAllowedPiSubpackagePeerEdge(from, to)) return undefined;
  const debt = ALLOWED_DEBT_EDGES.get(`${from}\0${to}`);
  if (debt !== undefined) {
    return { from, to, fromTier, toTier, severity: "debt", policy: `${fromTier}-must-not-depend-on-${toTier}`, debtNote: debt };
  }
  return { from, to, fromTier, toTier, severity: "hard", policy: `${fromTier}-must-not-depend-on-${toTier}` };
}

function isAllowedPiSubpackagePeerEdge(from, to) {
  if (to !== "@sdl/pi") return false;
  if (pkgs[from]?.tier !== "capability") return false;
  const manifest = manifests[from];
  return (
    Array.isArray(manifest?.sdl?.subpackages) &&
    manifest.sdl.subpackages.includes("pi") &&
    manifest?.peerDependencies?.["@sdl/pi"] !== undefined &&
    manifest?.peerDependenciesMeta?.["@sdl/pi"]?.optional === true
  );
}

const tierViolations = [];
for (const [from, deps] of Object.entries(graph)) {
  for (const to of deps) {
    const violation = tierViolationForEdge(from, to);
    if (violation !== undefined) tierViolations.push(violation);
  }
}

const circles = discoverTopologyCircles();
const circleById = new Map(circles.map((circle) => [circle.id, circle]));
const circleByPackageComponent = new Map(circles.map((circle) => [`${circle.packageName}\0${circle.component}`, circle]));
const circleGraph = buildCircleGraph(circles);
const circleCycles = findCycles(circleGraph);

function discoverTopologyCircles() {
  const discovered = [];
  for (const [packageName, p] of Object.entries(pkgs).sort()) {
    const srcDir = join(p.path, SRC_DIR);
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) continue;
    // A fully decomposed package (every src file inside a declared subpackage)
    // gets no root/remainder circle — an empty shell node carries no signal.
    const rootFiles = filesForPackageRootCircle(packageName, srcDir);
    if (rootFiles.length > 0 || declaredSubpackages(manifests[packageName]).length === 0) {
      discovered.push({
        id: packageName,
        packageName,
        component: ".",
        tier: p.tier,
        path: toPosix(srcDir),
        loc: countLocForFiles(rootFiles),
      });
    }

    for (const component of declaredSubpackages(manifests[packageName])) {
      const componentDir = join(srcDir, component);
      if (!existsSync(componentDir) || !statSync(componentDir).isDirectory()) continue;
      const componentFiles = sourceFilePathsUnder(componentDir);
      discovered.push({
        id: `${packageName}/${component}`,
        packageName,
        component,
        tier: p.tier,
        path: toPosix(componentDir),
        loc: countLocForFiles(componentFiles),
      });
    }
  }
  return discovered;
}

function declaredSubpackages(manifest) {
  const value = manifest?.sdl?.subpackages;
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => typeof entry === "string" && entry !== "");
}

function filesForPackageRootCircle(packageName, srcDir) {
  const declaredComponentDirs = new Set(
    declaredSubpackages(manifests[packageName]).map((component) => toPosix(join(srcDir, component))),
  );
  return sourceFilePathsUnder(srcDir).filter((file) => {
    const normalized = toPosix(file);
    for (const dir of declaredComponentDirs) {
      if (normalized === dir || normalized.startsWith(`${dir}/`)) return false;
    }
    return true;
  });
}

function buildCircleGraph(discoveredCircles) {
  const out = Object.fromEntries(discoveredCircles.map((circle) => [circle.id, []]));
  const edges = new Map(Object.keys(out).map((id) => [id, new Set()]));
  for (const circle of discoveredCircles) {
    for (const file of filesForCircle(circle)) {
      const text = readFileSync(file, "utf8");
      for (const specifier of staticSpecifiers(text)) {
        const targetCircle = circleForSpecifier(specifier, file);
        if (targetCircle === undefined) continue;
        if (targetCircle.id === circle.id) continue;
        edges.get(circle.id)?.add(targetCircle.id);
      }
    }
  }
  for (const [id, targets] of edges) out[id] = [...targets].sort();
  return out;
}

function filesForCircle(circle) {
  if (circle.component === ".") return filesForPackageRootCircle(circle.packageName, circle.path);
  return sourceFilePathsUnder(circle.path);
}

function staticSpecifiers(text) {
  if (workspaceTypescript !== undefined) {
    return workspaceTypescript.preProcessFile(text, true, true).importedFiles.map((file) => file.fileName);
  }
  return regexStaticSpecifiers(text);
}

// Fallback scan for workspaces without a resolvable typescript install. Misses
// dynamic import() and can match import-shaped text inside strings/comments.
function regexStaticSpecifiers(text) {
  const specifiers = [];
  const fromPattern = /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g;
  const sideEffectPattern = /\bimport\s+["']([^"']+)["']/g;
  for (const pattern of [fromPattern, sideEffectPattern]) {
    let match;
    while ((match = pattern.exec(text)) !== null) specifiers.push(match[1]);
  }
  return specifiers;
}

function circleForSpecifier(specifier, importerFile) {
  if (specifier.startsWith(".")) return circleForPath(resolve(dirname(importerFile), specifier));
  const packageName = packageNameForSpecifier(specifier);
  if (packageName === undefined) return undefined;
  const exportedFileCircle = circleForExportedFile(specifier, packageName);
  if (exportedFileCircle !== undefined) return exportedFileCircle;
  const component = componentForPackageSpecifier(specifier, packageName);
  return circleByPackageComponent.get(`${packageName}\0${component}`) ?? circleByPackageComponent.get(`${packageName}\0.`);
}

// Subpath exports are aliases (`@sdl/core/result` -> src/primitives/result.ts),
// so specifier segments alone misattribute edges to the package-root circle.
// Resolve through the exports map and credit the circle that owns the file.
function circleForExportedFile(specifier, packageName) {
  const exportsMap = manifests[packageName]?.exports;
  if (exportsMap === undefined) return undefined;
  const key = specifier === packageName ? "." : `./${specifier.slice(packageName.length + 1)}`;
  const target = exportsMap[key];
  if (typeof target !== "string") return undefined;
  return circleForPath(resolve(pkgs[packageName].path, target));
}

function packageNameForSpecifier(specifier) {
  const sortedNames = [...names].sort((left, right) => right.length - left.length);
  return sortedNames.find((name) => specifier === name || specifier.startsWith(`${name}/`));
}

function componentForPackageSpecifier(specifier, packageName) {
  if (specifier === packageName) return ".";
  const rest = specifier.slice(packageName.length + 1);
  const first = rest.split("/")[0];
  if (first === undefined || first === "") return ".";
  return circleByPackageComponent.has(`${packageName}\0${first}`) ? first : ".";
}

function circleForPath(path) {
  const targetFile = resolveSourceFile(path);
  if (targetFile === undefined) return undefined;
  // Resolve both sides: the target is already cwd-absolute (built via
  // resolve()), while circle paths stay ROOT-relative when --root is relative.
  const normalizedTarget = toPosix(resolve(targetFile));
  let best;
  let bestPathLength = -1;
  for (const circle of circleById.values()) {
    const circlePath = toPosix(resolve(circle.path));
    if (normalizedTarget === circlePath || normalizedTarget.startsWith(`${circlePath}/`)) {
      if (circlePath.length > bestPathLength) {
        best = circle;
        bestPathLength = circlePath.length;
      }
    }
  }
  return best;
}

function resolveSourceFile(path) {
  const candidates = [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    join(path, "index.ts"),
    join(path, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

const exposesApi = {};
const apiOnly = [];
const kitConsumers = [];
const orphans = [];

for (const [name, p] of Object.entries(pkgs)) {
  const apiExports = p.exports.filter((e) => e.toLowerCase().includes(API_NEEDLE.toLowerCase()));
  if (apiExports.length) exposesApi[name] = apiExports;
  const nonApi = p.exports.filter((e) => !e.toLowerCase().includes(API_NEEDLE.toLowerCase()));
  if (apiExports.length && nonApi.length === 0) apiOnly.push(name);
  if (graph[name]?.includes(KIT)) kitConsumers.push(name);
  if (fanIn[name] === 0) orphans.push(name);
}

const ranked = (m) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

const out = {
  meta: {
    root: ROOT,
    kit: KIT,
    apiNeedle: API_NEEDLE,
    packageCount: names.size,
    topologyCircleCount: circles.length,
    edgeKinds: "package graph: runtime (dependencies + peerDependencies); circle graph: static TypeScript imports/exports",
    topologyCircleConvention: "package root/remainder circle plus manifest-declared sdl.subpackages circles",
    tiers: TIERS,
    tierPolicy: Object.fromEntries(Object.entries(TIER_POLICY).map(([tier, allowed]) => [tier, [...allowed].sort()])),
  },
  packages: Object.fromEntries(
    Object.entries(pkgs)
      .sort()
      .map(([n, p]) => [n, { path: p.path, tier: p.tier, exports: p.exports, runtimeDeps: graph[n], loc: p.loc }]),
  ),
  topologyCircles: Object.fromEntries(circles.map((circle) => [circle.id, circle])),
  graph,
  circleGraph,
  tierViolations,
  cycles,
  circleCycles,
  fanOut: ranked(fanOut),
  fanIn: ranked(fanIn),
  exposesApi,
  apiOnly,
  kitConsumers,
  orphans,
};

if (OUT === true) {
  console.error("`--out` requires a path");
  process.exit(1);
}

const json = JSON.stringify(out, null, PRETTY ? 2 : 0) + "\n";
process.stdout.write(json);
if (typeof OUT === "string") writeFileSync(OUT, json);
