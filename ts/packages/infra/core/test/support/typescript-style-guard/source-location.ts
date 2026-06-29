import type * as ts from "typescript";

export interface SourceLocationFields {
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
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
