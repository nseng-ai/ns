import { readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

export interface LiteralSpecifierUse {
	specifier: string;
	kind: "static-import" | "re-export" | "dynamic-import";
}

export function sourceFilesUnder(directory: string): readonly string[] {
	const files: string[] = [];
	const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	for (const entry of entries) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path));
		if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

export function literalSpecifierUsesOf(source: string): readonly LiteralSpecifierUse[] {
	const specifiers: LiteralSpecifierUse[] = [];
	const importFromPattern = /\bimport\s+(?:type\s+)?[^;]*?\s+from\s+["']([^"']+)["']/g;
	const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;
	const exportPattern = /\bexport\s+(?:type\s+)?[^;]*?\s+from\s+["']([^"']+)["']/g;
	const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

	for (const match of source.matchAll(importFromPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push({ specifier, kind: "static-import" });
	}
	for (const match of source.matchAll(sideEffectImportPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push({ specifier, kind: "static-import" });
	}
	for (const match of source.matchAll(exportPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push({ specifier, kind: "re-export" });
	}
	for (const match of source.matchAll(dynamicImportPattern)) {
		const specifier = match[1];
		if (specifier !== undefined) specifiers.push({ specifier, kind: "dynamic-import" });
	}
	return specifiers;
}

export function literalSpecifiersOf(source: string): readonly string[] {
	return literalSpecifierUsesOf(source).map((use) => use.specifier);
}

export function fileForReport(file: string, baseDir = process.cwd()): string {
	return relative(baseDir, file) || file;
}
