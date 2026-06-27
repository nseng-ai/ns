import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { repoRoot, skippedDirectoryNames } from "./config.mjs";

export function loadPackageMetadata() {
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

export function findPackageJsonFiles(directory) {
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

export function collectExportSubpaths(exportsField) {
  if (exportsField === undefined) return new Set(["."]);
  if (typeof exportsField === "string") return new Set(["."]);
  if (exportsField === null || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return new Set();
  }
  return new Set(Object.keys(exportsField));
}

export function packageNameForPath(path, packageMetadataByName) {
  for (const metadata of packageMetadataByName.values()) {
    if (path === metadata.packageJsonPath) return metadata.name;
    if (path.startsWith(`${metadata.packageDir}/`)) return metadata.name;
  }
  return undefined;
}

export function packageNameForSpecifier(specifier) {
  if (specifier === "sdl-flow" || specifier.startsWith("sdl-flow/")) return "sdl-flow";
  if (!specifier.startsWith("@sdl/")) return undefined;
  const parts = specifier.split("/");
  if (parts.length < 2) return undefined;
  return `${parts[0]}/${parts[1]}`;
}

export function packageSubpathForSpecifier(specifier, packageName) {
  if (specifier === packageName) return ".";
  return `.${specifier.slice(packageName.length)}`;
}
