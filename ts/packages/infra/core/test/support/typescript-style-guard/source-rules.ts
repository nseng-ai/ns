import * as ts from "typescript";

import {
	BAN_AS_UNKNOWN_AS,
	BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
	BAN_EMPTY_INTERFACE_EXTENDS,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
} from "./config.ts";
import { moduleSpecifierText, parseTypeScriptSource } from "./module-specifiers.ts";
import {
	packageNameForPath,
	packageNameForSpecifier,
	packageSubpathForSpecifier,
	type PackageMetadata,
} from "./package-metadata.ts";

export interface SourceRuleViolation {
	readonly rule: string;
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
}

export function collectViolations(
	content: string,
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const sourceFile = parseTypeScriptSource(path, content);
	const violations: SourceRuleViolation[] = [];

	function visit(node: ts.Node): void {
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

		if (
			ts.isImportDeclaration(node) &&
			isPrivateCapabilityPeerImport(node, path, packageMetadataByName)
		) {
			violations.push(
				buildViolation(BAN_CAPABILITY_PRIVATE_PEER_IMPORT, path, sourceFile, node.moduleSpecifier),
			);
		}

		if (isAsUnknownAsExpression(node)) {
			violations.push(buildViolation(BAN_AS_UNKNOWN_AS, path, sourceFile, node));
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

function isFirstPartyImportDeclaration(node: ts.ImportDeclaration): boolean {
	const specifier = moduleSpecifierText(node);
	if (specifier === undefined) return false;
	return isFirstPartyModuleSpecifier(specifier);
}

function isPrivateCapabilityPeerImport(
	node: ts.ImportDeclaration,
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	const specifier = moduleSpecifierText(node);
	if (specifier === undefined) return false;

	const importerPackageName = packageNameForPath(path, packageMetadataByName);
	if (importerPackageName === undefined) return false;
	const importerPackageMetadata = packageMetadataByName.get(importerPackageName);
	if (importerPackageMetadata?.sdlTier !== "capability") return false;

	const importedPackageName = packageNameForSpecifier(specifier);
	if (importedPackageName === undefined) return false;
	if (importedPackageName === importerPackageName) return false;
	const importedPackageMetadata = packageMetadataByName.get(importedPackageName);
	if (importedPackageMetadata?.sdlTier === "neutral-infra") return false;
	if (importedPackageMetadata?.sdlTier === "capability-kit") return false;
	if (importedPackageName === "@sdl/sdl") return false;
	if (importedPackageMetadata?.sdlTier !== "capability") return false;

	const importedSubpath = packageSubpathForSpecifier(specifier, importedPackageName);
	if (importedSubpath === ".") return false;
	if (importedSubpath === "./api") return false;
	if (isPrivateCapabilitySubpath(importedSubpath)) return true;

	return !importedPackageMetadata.exportSubpaths.has(importedSubpath);
}

function isPrivateCapabilitySubpath(subpath: string): boolean {
	return (
		subpath.startsWith("./src/") || subpath === "./internal" || subpath.startsWith("./internal/")
	);
}

function isFirstPartyModuleSpecifier(specifier: string): boolean {
	return (
		specifier.startsWith(".") ||
		specifier.startsWith("/") ||
		specifier.startsWith("@/") ||
		specifier.startsWith("@sdl/") ||
		specifier === "sdlcc" ||
		specifier.startsWith("sdlcc/")
	);
}

function hasExtendsClause(node: ts.InterfaceDeclaration): boolean {
	return (
		node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword) === true
	);
}

function isAsUnknownAsExpression(node: ts.Node): boolean {
	if (!ts.isAsExpression(node)) return false;
	const innerExpression = unwrapParentheses(node.expression);
	return (
		ts.isAsExpression(innerExpression) && innerExpression.type.kind === ts.SyntaxKind.UnknownKeyword
	);
}

function unwrapParentheses(expression: ts.Expression): ts.Expression {
	let current = expression;
	while (ts.isParenthesizedExpression(current)) {
		current = current.expression;
	}
	return current;
}

function buildViolation(
	rule: string,
	path: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
): SourceRuleViolation {
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

function singleLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
