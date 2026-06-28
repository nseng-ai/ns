import { extname } from "node:path";

import * as ts from "typescript";

export function parseTypeScriptSource(path: string, content: string): ts.SourceFile {
	return ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, scriptKindForPath(path));
}

export function moduleSpecifierText(
	node: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
	const moduleSpecifier = node.moduleSpecifier;
	return moduleSpecifier !== undefined && ts.isStringLiteralLike(moduleSpecifier)
		? moduleSpecifier.text
		: undefined;
}

export function collectStaticModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
	const specifiers: string[] = [];

	function visit(node: ts.Node): void {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined) specifiers.push(specifier);
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return specifiers;
}

export function collectRelativeStaticModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
	return collectStaticModuleSpecifiers(sourceFile).filter((specifier) => specifier.startsWith("."));
}

export function importsOrExportsSpecifier(
	sourceFile: ts.SourceFile,
	predicate: (specifier: string) => boolean,
): string | undefined {
	return collectStaticModuleSpecifiers(sourceFile).find(predicate);
}

function scriptKindForPath(path: string): ts.ScriptKind {
	switch (extname(path)) {
		case ".tsx":
			return ts.ScriptKind.TSX;
		case ".jsx":
			return ts.ScriptKind.JSX;
		case ".js":
		case ".mjs":
		case ".cjs":
			return ts.ScriptKind.JS;
		case ".json":
			return ts.ScriptKind.JSON;
		default:
			return ts.ScriptKind.TS;
	}
}
