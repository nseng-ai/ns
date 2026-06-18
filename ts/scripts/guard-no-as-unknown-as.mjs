#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const packagesRoot = join(repoRoot, "ts", "packages");
const needle = "as unknown as";

/** @type {Array<{ path: string; line: number; text: string }>} */
const matches = [];

function scanDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;

    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;

    const content = readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (line.includes(needle)) {
        matches.push({ path: relative(repoRoot, fullPath), line: index + 1, text: line.trim() });
      }
    }
  }
}

scanDirectory(packagesRoot);

if (matches.length === 0) {
  console.log("OK: no `as unknown as` TypeScript double-casts found under ts/packages.");
  process.exit(0);
}

console.error("TypeScript guard failed: `as unknown as` is banned everywhere, including tests.");
console.error("Fix by building complete typed fixtures, deriving types from a source of truth, or adding a narrow boundary assertion.");
console.error("");
for (const match of matches) {
  console.error(`${match.path}:${match.line}: ${match.text}`);
}
process.exit(1);
