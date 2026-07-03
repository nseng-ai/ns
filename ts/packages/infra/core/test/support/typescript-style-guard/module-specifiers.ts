import type * as ts from "typescript";
import { forEachChild, isExportDeclaration, isImportDeclaration } from "typescript";

import { moduleSpecifierText } from "@ns/core/typescript-analysis";

export function collectStaticModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
	const specifiers: string[] = [];

	function visit(node: ts.Node): void {
		if (isImportDeclaration(node) || isExportDeclaration(node)) {
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined) specifiers.push(specifier);
		}
		forEachChild(node, visit);
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
