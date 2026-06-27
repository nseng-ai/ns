#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import ts from "typescript";

const repoRoot = process.cwd();
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const skippedDirectoryNames = new Set([
  ".git",
  ".next",
  ".source",
  ".turbo",
  ".agents",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

const BAN_AS_UNKNOWN_AS = "SDL_TS_BAN_AS_UNKNOWN_AS";
const BAN_IMPORT_ALIAS_FOR_FIRST_PARTY = "SDL_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY";
const BAN_EMPTY_INTERFACE_EXTENDS = "SDL_TS_BAN_EMPTY_INTERFACE_EXTENDS";
const BAN_CAPABILITY_PRIVATE_PEER_IMPORT = "SDL_TS_BAN_CAPABILITY_PRIVATE_PEER_IMPORT";
const BAN_EXTENSION_DEPENDENCY_CYCLE = "SDL_TS_BAN_EXTENSION_DEPENDENCY_CYCLE";

const capabilityPackageNames = new Set([
  "@sdl/aretro",
  "@sdl/branch-context",
  "@sdl/ccc",
  "@sdl/handoff",
  "@sdl/objective",
  "@sdl/plans",
  "@sdl/pr-address",
  "@sdl/roaster",
  "@sdl/slot",
  "sdl-flow",
]);
const neutralPeerPackageNames = new Set([
  "@sdl/brmem",
  "@sdl/clinkr",
  "@sdl/core",
  "@sdl/capability-kit",
  "@sdl/graphite",
]);
const manifestDependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
const extensionGraphPackageNames = new Set([
  ...capabilityPackageNames,
  "@sdl/autobranch",
  "@sdl/pi",
  "@sdl/sdl",
  "@sdl/worktree-status",
  "sdlcc",
]);
// Deferred by the objective-capability-extension slice: this known package cycle is real,
// but breaking it belongs to separate graph cleanup work, not this guard addition.
const deferredExtensionCycleEdges = new Set([
  "@sdl/autobranch->@sdl/pi",
  "@sdl/branch-context->@sdl/pi",
  "@sdl/pi->@sdl/branch-context",
  "@sdl/pi->@sdl/sdl",
  "@sdl/sdl->@sdl/autobranch",
]);
const packageMetadataByName = loadPackageMetadata();

/** @type {Array<{ rule: string; path: string; line: number; column: number; text: string }>} */
const matches = [];

runAdversarialReview();
matches.push(
  ...collectExtensionDependencyCycleViolations(
    packageMetadataByName,
    extensionGraphPackageNames,
    deferredExtensionCycleEdges,
  ),
);
scanDirectory(repoRoot);

if (matches.length === 0) {
  console.log(
    "OK: TypeScript style guard found no banned double-casts, first-party import aliases, empty interface-extension aliases, private capability peer imports, or non-deferred extension dependency cycles.",
  );
  process.exit(0);
}

console.error("TypeScript style guard failed.");
console.error(`${BAN_AS_UNKNOWN_AS}: \`as unknown as\` double-casts are banned everywhere, including tests.`);
console.error(
  `${BAN_IMPORT_ALIAS_FOR_FIRST_PARTY}: \`as\` in first-party import declarations is banned; preserve source names for monorepo-owned symbols. Third-party import aliases are allowed when used consistently.`,
);
console.error(
  `${BAN_EMPTY_INTERFACE_EXTENDS}: empty \`interface X extends Y {}\` aliases are banned; use \`type X = Y\` or add real members.`,
);
console.error(
  `${BAN_CAPABILITY_PRIVATE_PEER_IMPORT}: capability packages may import sibling capabilities through curated package exports such as \`@sdl/<cap>/api\`, but not private/deep \`src\`, \`internal\`, or undeclared capability subpaths.`,
);
console.error(
  `${BAN_EXTENSION_DEPENDENCY_CYCLE}: Objective-scoped extension packages must not form non-deferred cycles through \`workspace:*\` edges in package manifests under \`ts/packages/**/package.json\`. Remove or relocate manifest dependencies, or move shared code to neutral packages/API subpaths. The existing autobranch/branch-context/pi/sdl cycle is an explicit deferred follow-up, not a silent graph exclusion.`,
);
console.error("");
for (const match of matches) {
  console.error(`${match.path}:${match.line}:${match.column}: ${match.rule}: ${match.text}`);
}
process.exit(1);

function scanDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) scanDirectory(join(directory, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;
    const fullPath = join(directory, entry.name);
    if (!isTypeScriptSource(fullPath)) continue;

    const content = readFileSync(fullPath, "utf8");
    matches.push(...collectViolations(content, relative(repoRoot, fullPath)));
  }
}

function isTypeScriptSource(path) {
  return sourceExtensions.has(extname(path));
}

function collectViolations(content, path) {
  const sourceFile = ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  /** @type {Array<{ rule: string; path: string; line: number; column: number; text: string }>} */
  const violations = [];

  function visit(node) {
    if (ts.isImportDeclaration(node) && isFirstPartyImportDeclaration(node)) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings !== undefined) {
        if (ts.isNamespaceImport(namedBindings)) {
          violations.push(
            buildViolation(BAN_IMPORT_ALIAS_FOR_FIRST_PARTY, path, sourceFile, namedBindings),
          );
        } else {
          for (const element of namedBindings.elements) {
            if (element.propertyName !== undefined) {
              violations.push(
                buildViolation(BAN_IMPORT_ALIAS_FOR_FIRST_PARTY, path, sourceFile, element),
              );
            }
          }
        }
      }
    }

    if (ts.isInterfaceDeclaration(node) && node.members.length === 0 && hasExtendsClause(node)) {
      violations.push(buildViolation(BAN_EMPTY_INTERFACE_EXTENDS, path, sourceFile, node));
    }

    if (ts.isImportDeclaration(node) && isPrivateCapabilityPeerImport(node, path)) {
      violations.push(buildViolation(BAN_CAPABILITY_PRIVATE_PEER_IMPORT, path, sourceFile, node.moduleSpecifier));
    }

    if (isAsUnknownAsExpression(node)) {
      violations.push(buildViolation(BAN_AS_UNKNOWN_AS, path, sourceFile, node));
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function isFirstPartyImportDeclaration(node) {
  const specifier = moduleSpecifierText(node);
  if (specifier === undefined) return false;
  return isFirstPartyModuleSpecifier(specifier);
}

function isPrivateCapabilityPeerImport(node, path) {
  const specifier = moduleSpecifierText(node);
  if (specifier === undefined) return false;

  const importerPackageName = packageNameForPath(path);
  if (importerPackageName === undefined) return false;
  if (!capabilityPackageNames.has(importerPackageName)) return false;

  const importedPackageName = packageNameForSpecifier(specifier);
  if (importedPackageName === undefined) return false;
  if (importedPackageName === importerPackageName) return false;
  if (neutralPeerPackageNames.has(importedPackageName)) return false;
  if (importedPackageName === "@sdl/sdl") return false;
  if (!capabilityPackageNames.has(importedPackageName)) return false;

  const importedSubpath = packageSubpathForSpecifier(specifier, importedPackageName);
  if (importedSubpath === ".") return false;
  if (importedSubpath === "./api") return false;
  if (isPrivateCapabilitySubpath(importedSubpath)) return true;

  const importedPackageMetadata = packageMetadataByName.get(importedPackageName);
  if (importedPackageMetadata === undefined) return true;
  return !importedPackageMetadata.exportSubpaths.has(importedSubpath);
}

function packageNameForPath(path) {
  for (const metadata of packageMetadataByName.values()) {
    if (path === metadata.packageJsonPath) return metadata.name;
    if (path.startsWith(`${metadata.packageDir}/`)) return metadata.name;
  }
  return undefined;
}

function packageNameForSpecifier(specifier) {
  if (specifier === "sdl-flow" || specifier.startsWith("sdl-flow/")) return "sdl-flow";
  if (!specifier.startsWith("@sdl/")) return undefined;
  const parts = specifier.split("/");
  if (parts.length < 2) return undefined;
  return `${parts[0]}/${parts[1]}`;
}

function packageSubpathForSpecifier(specifier, packageName) {
  if (specifier === packageName) return ".";
  return `.${specifier.slice(packageName.length)}`;
}

function isPrivateCapabilitySubpath(subpath) {
  return subpath.startsWith("./src/") || subpath === "./internal" || subpath.startsWith("./internal/");
}

function loadPackageMetadata() {
  /** @type {Map<string, { name: string; packageDir: string; packageJsonPath: string; manifest: Record<string, unknown>; manifestContent: string; exportSubpaths: Set<string> }>} */
  const metadataByName = new Map();
  for (const packageJsonPath of findPackageJsonFiles(join(repoRoot, "ts", "packages"))) {
    const packageDir = packageJsonPath.slice(0, -"/package.json".length);
    const manifestContent = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(manifestContent);
    if (typeof parsed.name !== "string") continue;
    metadataByName.set(parsed.name, {
      name: parsed.name,
      packageDir: relative(repoRoot, packageDir),
      packageJsonPath: relative(repoRoot, packageJsonPath),
      manifest: parsed,
      manifestContent,
      exportSubpaths: collectExportSubpaths(parsed.exports),
    });
  }
  return metadataByName;
}

function findPackageJsonFiles(directory) {
  /** @type {string[]} */
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) paths.push(...findPackageJsonFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "package.json") paths.push(fullPath);
  }
  return paths;
}

function collectExportSubpaths(exportsField) {
  if (exportsField === undefined) return new Set(["."]);
  if (typeof exportsField === "string") return new Set(["."]);
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return new Set();
  }
  return new Set(Object.keys(exportsField));
}

function moduleSpecifierText(node) {
  return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined;
}

function isFirstPartyModuleSpecifier(specifier) {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("@/") ||
    specifier.startsWith("@sdl/") ||
    specifier === "sdlcc" ||
    specifier.startsWith("sdlcc/")
  );
}

function hasExtendsClause(node) {
  return node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword) === true;
}

function isAsUnknownAsExpression(node) {
  if (!ts.isAsExpression(node)) return false;
  const innerExpression = unwrapParentheses(node.expression);
  return ts.isAsExpression(innerExpression) && innerExpression.type.kind === ts.SyntaxKind.UnknownKeyword;
}

function unwrapParentheses(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function buildViolation(rule, path, sourceFile, node) {
  const start = node.getStart(sourceFile);
  const position = sourceFile.getLineAndCharacterOfPosition(start);
  return {
    rule,
    path,
    line: position.line + 1,
    column: position.character + 1,
    text: singleLine(node.getText(sourceFile)),
  };
}

function collectExtensionDependencyCycleViolations(metadataByName, graphPackageNames, deferredEdges) {
  const edges = collectExtensionManifestWorkspaceEdges(metadataByName, graphPackageNames);
  const cycleComponents = findCycleComponents([...graphPackageNames].sort(), edges);
  /** @type {Array<{ rule: string; path: string; line: number; column: number; text: string }>} */
  const violations = [];

  for (const component of cycleComponents) {
    const componentPackages = new Set(component);
    const componentEdges = edges.filter((edge) => componentPackages.has(edge.from) && componentPackages.has(edge.to));
    const nonDeferredEdges = componentEdges.filter((edge) => !deferredEdges.has(extensionEdgeKey(edge.from, edge.to)));
    if (nonDeferredEdges.length === 0) continue;

    const packagesText = [...component].sort().join(", ");
    const deferredEdgeCount = componentEdges.length - nonDeferredEdges.length;
    const deferredText = deferredEdgeCount > 0 ? `; ${deferredEdgeCount} known edge(s) in this component are explicitly deferred` : "";
    for (const edge of nonDeferredEdges) {
      violations.push({
        rule: BAN_EXTENSION_DEPENDENCY_CYCLE,
        path: edge.path,
        line: edge.line,
        column: edge.column,
        text: `non-deferred manifest workspace cycle among ${packagesText}; edge ${edge.from} -> ${edge.to} in ${edge.field} participates${deferredText}`,
      });
    }
  }

  return violations;
}

function collectExtensionManifestWorkspaceEdges(metadataByName, graphPackageNames) {
  /** @type {Array<{ from: string; to: string; field: string; path: string; line: number; column: number }>} */
  const edges = [];
  for (const from of [...graphPackageNames].sort()) {
    const metadata = metadataByName.get(from);
    if (metadata === undefined) continue;

    for (const field of manifestDependencyFields) {
      const dependencies = metadata.manifest[field];
      if (!isDependencyMap(dependencies)) continue;

      for (const [to, versionSpecifier] of Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))) {
        if (!graphPackageNames.has(to)) continue;
        if (typeof versionSpecifier !== "string" || !versionSpecifier.startsWith("workspace:")) continue;
        const position = findManifestDependencyPosition(metadata.manifestContent, to);
        edges.push({
          from,
          to,
          field,
          path: metadata.packageJsonPath,
          line: position.line,
          column: position.column,
        });
      }
    }
  }
  return edges;
}

function isDependencyMap(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findManifestDependencyPosition(content, dependencyName) {
  const offset = content.indexOf(`"${dependencyName}"`);
  if (offset < 0) return { line: 1, column: 1 };
  return lineAndColumnForOffset(content, offset);
}

function lineAndColumnForOffset(content, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function findCycleComponents(packageNames, edges) {
  const adjacency = new Map(packageNames.map((packageName) => [packageName, []]));
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from).push(edge.to);
  }
  for (const neighbors of adjacency.values()) neighbors.sort();

  let nextIndex = 0;
  const stack = [];
  const stackMembers = new Set();
  const indices = new Map();
  const lowlinks = new Map();
  /** @type {string[][]} */
  const components = [];

  function strongConnect(packageName) {
    indices.set(packageName, nextIndex);
    lowlinks.set(packageName, nextIndex);
    nextIndex += 1;
    stack.push(packageName);
    stackMembers.add(packageName);

    for (const neighbor of adjacency.get(packageName) ?? []) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        lowlinks.set(packageName, Math.min(lowlinks.get(packageName), lowlinks.get(neighbor)));
      } else if (stackMembers.has(neighbor)) {
        lowlinks.set(packageName, Math.min(lowlinks.get(packageName), indices.get(neighbor)));
      }
    }

    if (lowlinks.get(packageName) !== indices.get(packageName)) return;

    const component = [];
    while (stack.length > 0) {
      const member = stack.pop();
      stackMembers.delete(member);
      component.push(member);
      if (member === packageName) break;
    }

    const componentMembers = new Set(component);
    const hasSelfEdge = edges.some((edge) => edge.from === edge.to && componentMembers.has(edge.from));
    if (component.length > 1 || hasSelfEdge) components.push(component.sort());
  }

  for (const packageName of [...adjacency.keys()].sort()) {
    if (!indices.has(packageName)) strongConnect(packageName);
  }

  return components.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
}

function extensionEdgeKey(from, to) {
  return `${from}->${to}`;
}

function singleLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

function runAdversarialReview() {
  runExtensionDependencyGraphAdversarialReview();

  const cases = [
    {
      name: "first-party named import alias is rejected",
      code: 'import { Foo as Bar } from "@sdl/core";',
      expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
    },
    {
      name: "relative namespace import is rejected",
      code: 'import * as sdkModule from "./sdk.ts";',
      expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
    },
    {
      name: "docs-site path alias import alias is rejected",
      code: 'import { config as geistdocsConfig } from "@/lib/geistdocs/config";',
      expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
    },
    {
      name: "multiline first-party type import alias is rejected",
      code: 'import {\n  type Foo as Bar,\n} from "@sdl/core";',
      expectedRules: [BAN_IMPORT_ALIAS_FOR_FIRST_PARTY],
    },
    {
      name: "third-party named import alias is allowed",
      code: 'import { GeistdocsDocsLayout as PackageDocsLayout } from "@vercel/geistdocs/layout";',
      expectedRules: [],
    },
    {
      name: "capability peer api import is allowed",
      code: 'import { createHandoff } from "@sdl/handoff/api";',
      path: "ts/packages/ccc/src/peer.ts",
      expectedRules: [],
    },
    {
      name: "capability private src import is rejected",
      code: 'import { createHandoff } from "@sdl/handoff/src/create.ts";',
      path: "ts/packages/ccc/src/peer.ts",
      expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
    },
    {
      name: "capability undeclared subpath import is rejected",
      code: 'import { createHandoff } from "@sdl/handoff/private-helper";',
      path: "ts/packages/ccc/src/peer.ts",
      expectedRules: [BAN_CAPABILITY_PRIVATE_PEER_IMPORT],
    },
    {
      name: "neutral infra import is allowed for capabilities",
      code: 'import { RealGitGateway } from "@sdl/core/git";',
      path: "ts/packages/ccc/src/peer.ts",
      expectedRules: [],
    },
    {
      name: "capability-kit import is allowed for capabilities",
      code: 'import { createSdlGitGateway } from "@sdl/capability-kit";',
      path: "ts/packages/ccc/src/peer.ts",
      expectedRules: [],
    },
    {
      name: "node namespace import is allowed",
      code: 'import * as path from "node:path";',
      expectedRules: [],
    },
    {
      name: "third-party local alias workaround is advisory-only",
      code: 'import { Foo } from "pkg";\nconst Bar = Foo;',
      expectedRules: [],
    },
    {
      name: "ordinary imported binding use is allowed",
      code: 'import { Foo } from "pkg";\nconst value = Foo();',
      expectedRules: [],
    },
    {
      name: "empty interface extension alias is rejected",
      code: "interface Child extends Parent {}",
      expectedRules: [BAN_EMPTY_INTERFACE_EXTENDS],
    },
    {
      name: "multiline empty interface extension alias is rejected",
      code: "interface Child extends Parent {\n  // comments are not members\n}",
      expectedRules: [BAN_EMPTY_INTERFACE_EXTENDS],
    },
    {
      name: "double-cast through unknown is rejected",
      code: "const value = input as unknown as Output;",
      expectedRules: [BAN_AS_UNKNOWN_AS],
    },
    {
      name: "parenthesized double-cast through unknown is rejected",
      code: "const value = (input as unknown) as Output;",
      expectedRules: [BAN_AS_UNKNOWN_AS],
    },
    {
      name: "ordinary first-party named import is allowed",
      code: 'import { Foo } from "@sdl/core";',
      expectedRules: [],
    },
    {
      name: "export alias is outside the import-as rule",
      code: 'export { Foo as Bar } from "@sdl/core";',
      expectedRules: [],
    },
    {
      name: "non-empty interface extension is allowed",
      code: "interface Child extends Parent {\n  readonly id: string;\n}",
      expectedRules: [],
    },
    {
      name: "type alias replacement is allowed",
      code: "type Child = Parent;",
      expectedRules: [],
    },
    {
      name: "prose mentions do not trigger syntax rules",
      code: 'const text = "import { Foo as Bar } from pkg; interface Child extends Parent {}";',
      expectedRules: [],
    },
  ];

  for (const testCase of cases) {
    const actualRules = collectViolations(
      testCase.code,
      testCase.path ?? `adversarial/${testCase.name}.ts`,
    ).map((violation) => violation.rule);
    const expected = [...testCase.expectedRules].sort();
    const actual = [...actualRules].sort();
    if (expected.join("\n") !== actual.join("\n")) {
      reportAdversarialReviewFailure(testCase.name, expected, actual);
    }
  }
}

function runExtensionDependencyGraphAdversarialReview() {
  const syntheticPackages = new Set([
    "@sdl/autobranch",
    "@sdl/branch-context",
    "@sdl/ccc",
    "@sdl/pi",
    "@sdl/sdl",
  ]);
  const deferredEdges = [...deferredExtensionCycleEdges].map((key) => {
    const [from, to] = key.split("->");
    return { from, to };
  });
  const cases = [
    {
      name: "acyclic extension manifest graph is allowed",
      edges: [{ from: "@sdl/pi", to: "@sdl/ccc" }],
      expectedHasCycle: false,
    },
    {
      name: "synthetic extension manifest cycle is rejected",
      edges: [
        { from: "@sdl/pi", to: "@sdl/ccc" },
        { from: "@sdl/ccc", to: "@sdl/pi" },
      ],
      expectedHasCycle: true,
    },
    {
      name: "exact deferred extension manifest cycle is allowed",
      edges: deferredEdges,
      expectedHasCycle: false,
    },
    {
      name: "new non-deferred cycle involving a deferred package is rejected",
      edges: [
        ...deferredEdges,
        { from: "@sdl/pi", to: "@sdl/ccc" },
        { from: "@sdl/ccc", to: "@sdl/pi" },
      ],
      expectedHasCycle: true,
    },
  ];

  for (const testCase of cases) {
    const metadataByName = buildSyntheticPackageMetadata(syntheticPackages, testCase.edges);
    const actualRules = collectExtensionDependencyCycleViolations(
      metadataByName,
      syntheticPackages,
      deferredExtensionCycleEdges,
    ).map((violation) => violation.rule);
    const actualHasCycle = actualRules.includes(BAN_EXTENSION_DEPENDENCY_CYCLE);
    if (actualHasCycle !== testCase.expectedHasCycle) {
      const expected = testCase.expectedHasCycle ? [BAN_EXTENSION_DEPENDENCY_CYCLE] : [];
      const actual = [...new Set(actualRules)].sort();
      reportAdversarialReviewFailure(testCase.name, expected, actual);
    }
  }
}

function buildSyntheticPackageMetadata(packageNames, edges) {
  const dependenciesByPackage = new Map([...packageNames].map((packageName) => [packageName, {}]));
  for (const edge of edges) {
    dependenciesByPackage.get(edge.from)[edge.to] = "workspace:*";
  }

  const metadataByName = new Map();
  for (const packageName of [...packageNames].sort()) {
    const manifest = {
      name: packageName,
      dependencies: dependenciesByPackage.get(packageName),
    };
    metadataByName.set(packageName, {
      name: packageName,
      packageDir: `synthetic/${packageName}`,
      packageJsonPath: `synthetic/${packageName}/package.json`,
      manifest,
      manifestContent: JSON.stringify(manifest, null, 2),
      exportSubpaths: new Set(["."]),
    });
  }
  return metadataByName;
}

function reportAdversarialReviewFailure(caseName, expected, actual) {
  console.error("TypeScript style guard adversarial review failed.");
  console.error(`Case: ${caseName}`);
  console.error(`Expected rules: ${expected.join(", ") || "(none)"}`);
  console.error(`Actual rules: ${actual.join(", ") || "(none)"}`);
  process.exit(2);
}
