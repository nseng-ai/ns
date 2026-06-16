import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import * as ts from "typescript";

export async function sourceFilesUnder(root: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(root, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = resolve(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await sourceFilesUnder(entryPath)));
		} else if (entry.isFile() && entryPath.endsWith(".ts")) {
			files.push(entryPath);
		}
	}

	return files.sort();
}

export function identifierTokens(source: string): ReadonlySet<string> {
	const sourceFile = ts.createSourceFile("source-file.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
	const identifiers = new Set<string>();

	function visit(node: ts.Node): void {
		if (ts.isIdentifier(node)) identifiers.add(node.text);
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return identifiers;
}

export function staticLocalSpecifiers(source: string): string[] {
	const importFromPattern = /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
	const exportFromPattern = /\bexport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g;
	const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
	const specifiers = new Set<string>([
		...collectLocalSpecifiers(source, importFromPattern),
		...collectLocalSpecifiers(source, exportFromPattern),
		...collectLocalSpecifiers(source, dynamicImportPattern),
	]);

	return [...specifiers].sort();
}

function collectLocalSpecifiers(source: string, pattern: RegExp): string[] {
	const specifiers: string[] = [];
	for (const match of source.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier !== undefined && specifier.startsWith(".")) specifiers.push(specifier);
	}
	return specifiers;
}
