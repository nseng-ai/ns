#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { runAdversarialReview } from "./typescript-style-guard/adversarial-review.mjs";
import {
  BAN_AS_UNKNOWN_AS,
  BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
  BAN_EMPTY_INTERFACE_EXTENDS,
  BAN_EXTENSION_DEPENDENCY_CYCLE,
  BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
  deferredExtensionCycleComponents,
  extensionGraphPackageNames,
  repoRoot,
  skippedDirectoryNames,
  sourceExtensions,
} from "./typescript-style-guard/config.mjs";
import { collectExtensionDependencyCycleViolations } from "./typescript-style-guard/dependency-graph.mjs";
import { loadPackageMetadata } from "./typescript-style-guard/package-metadata.mjs";
import { collectViolations } from "./typescript-style-guard/source-rules.mjs";

const packageMetadataByName = loadPackageMetadata();
const matches = [];

runAdversarialReview(packageMetadataByName);
matches.push(
  ...collectExtensionDependencyCycleViolations(
    packageMetadataByName,
    extensionGraphPackageNames,
    deferredExtensionCycleComponents,
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
  `${BAN_EXTENSION_DEPENDENCY_CYCLE}: Objective-scoped extension packages must not form non-deferred cycles through manifest-scoped \`workspace:*\` edges in dependencies, optionalDependencies, or peerDependencies under \`ts/packages/**/package.json\`. devDependencies and source-import parity are intentionally out of scope. Remove or relocate manifest dependencies, or move shared code to neutral packages/API subpaths. The known deferred component is legacy-autobranch-branch-context-pi-sdl-cycle; it is explicit follow-up debt, not a silent graph exclusion.`,
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
    matches.push(...collectViolations(content, relative(repoRoot, fullPath), packageMetadataByName));
  }
}

function isTypeScriptSource(path) {
  return sourceExtensions.has(extname(path));
}
