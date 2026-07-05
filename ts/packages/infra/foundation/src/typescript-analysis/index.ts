import { extname } from "node:path";

import type * as ts from "typescript";
import { createSourceFile, isStringLiteralLike, ScriptKind, ScriptTarget } from "typescript";

export interface SourceLocationFields {
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

export function parseTypeScriptSource(path: string, content: string): ts.SourceFile {
	return createSourceFile(path, content, ScriptTarget.Latest, true, scriptKindForPath(path));
}

export function moduleSpecifierText(
	node: ts.ImportDeclaration | ts.ExportDeclaration,
): string | undefined {
	const moduleSpecifier = node.moduleSpecifier;
	return moduleSpecifier !== undefined && isStringLiteralLike(moduleSpecifier)
		? moduleSpecifier.text
		: undefined;
}

export function sourceLocationFields(
	path: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
): SourceLocationFields {
	const start = node.getStart(sourceFile);
	const position = sourceFile.getLineAndCharacterOfPosition(start);
	return {
		path,
		line: position.line + 1,
		column: position.character + 1,
		text: singleLineSourceText(node.getText(sourceFile)),
	};
}

export function singleLineSourceText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function scriptKindForPath(path: string): ts.ScriptKind {
	switch (extname(path)) {
		case ".tsx":
			return ScriptKind.TSX;
		case ".jsx":
			return ScriptKind.JSX;
		case ".js":
		case ".mjs":
		case ".cjs":
			return ScriptKind.JS;
		case ".json":
			return ScriptKind.JSON;
		default:
			return ScriptKind.TS;
	}
}
