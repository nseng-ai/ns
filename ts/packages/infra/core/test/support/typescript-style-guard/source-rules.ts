import * as ts from "typescript";

import {
	BAN_AS_UNKNOWN_AS,
	BAN_CAPABILITY_PRIVATE_PEER_IMPORT,
	BAN_EMPTY_INTERFACE_EXTENDS,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
	BAN_RAW_PRODUCTION_TIMERS,
	BAN_SNAKE_CASE_CLI_MACHINE_VALUE,
} from "./config.ts";
import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "@sdl/typescript-analysis";
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
		if (isRawProductionTimerNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_RAW_PRODUCTION_TIMERS,
					path,
					sourceFile,
					node,
					"Raw production timers are banned. Use Clock for wall-clock reads, TimerScheduler for timeout/interval scheduling, unrefTimerScheduler for Pi host background timers, or isolate raw timers in an explicit adapter/runtime-boundary allowlist.",
				),
			);
		}

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

		const snakeCaseMachineValueNode = snakeCaseCliMachineValueNode(node);
		if (snakeCaseMachineValueNode !== undefined) {
			violations.push(
				buildViolation(
					BAN_SNAKE_CASE_CLI_MACHINE_VALUE,
					path,
					sourceFile,
					snakeCaseMachineValueNode,
				),
			);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

const RAW_TIMER_GLOBALS = new Set(["setTimeout", "clearTimeout", "setInterval", "clearInterval"]);
const RAW_TIMER_ADAPTER_PATHS = new Set([
	"ts/packages/infra/core/src/time/index.ts",
	"ts/packages/hosts/pi/src/shared/timers.ts",
]);

function isRawProductionTimerNode(node: ts.Node, path: string): boolean {
	if (!isRawProductionTimerGuardPath(path)) return false;
	if (ts.isImportDeclaration(node)) {
		return moduleSpecifierText(node) === "node:timers/promises";
	}
	if (!ts.isCallExpression(node)) return false;
	const expression = node.expression;
	if (ts.isIdentifier(expression)) return RAW_TIMER_GLOBALS.has(expression.text);
	return isGlobalThisRawTimerCall(expression);
}

function isRawProductionTimerGuardPath(path: string): boolean {
	if (!path.startsWith("ts/packages/")) return false;
	if (path.includes("/test/")) return false;
	if (path.includes("/test-support/")) return false;
	return !RAW_TIMER_ADAPTER_PATHS.has(path);
}

function isGlobalThisRawTimerCall(expression: ts.Expression): boolean {
	return (
		ts.isPropertyAccessExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		expression.expression.text === "globalThis" &&
		RAW_TIMER_GLOBALS.has(expression.name.text)
	);
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
	if (importedPackageMetadata?.sdlTier === "capability-gateway-backend") return false;
	if (importedPackageName === "@sdl/kernel") return false;
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

// SDL-owned serialized CLI machine-contract enum values must be kebab-case, not
// snake_case (camelCase JSON property names are unaffected). This guard is narrow
// on purpose: it only inspects the Clinkr `failure(errorType, ...)` first argument
// and `errorType` property values, the two highest-confidence machine-contract
// surfaces. It does not attempt to police arbitrary `code`/`type`/`status` values,
// which require per-call classification and were explicitly scoped out as noisy.
const SNAKE_CASE_MACHINE_VALUE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function snakeCaseCliMachineValueNode(node: ts.Node): ts.StringLiteralLike | undefined {
	const failureErrorType = failureCallErrorTypeArgument(node);
	if (failureErrorType !== undefined && isSnakeCaseMachineValue(failureErrorType)) {
		return failureErrorType;
	}

	const errorTypeValue = errorTypePropertyValue(node);
	if (errorTypeValue !== undefined && isSnakeCaseMachineValue(errorTypeValue)) {
		return errorTypeValue;
	}

	return undefined;
}

function failureCallErrorTypeArgument(node: ts.Node): ts.StringLiteralLike | undefined {
	if (!ts.isCallExpression(node)) return undefined;
	if (!isFailureCallee(node.expression)) return undefined;
	const firstArgument = node.arguments[0];
	if (firstArgument === undefined || !ts.isStringLiteralLike(firstArgument)) return undefined;
	return firstArgument;
}

function isFailureCallee(expression: ts.Expression): boolean {
	if (ts.isIdentifier(expression)) return expression.text === "failure";
	if (ts.isPropertyAccessExpression(expression)) return expression.name.text === "failure";
	return false;
}

function errorTypePropertyValue(node: ts.Node): ts.StringLiteralLike | undefined {
	if (!ts.isPropertyAssignment(node)) return undefined;
	if (propertyNameText(node.name) !== "errorType") return undefined;
	if (!ts.isStringLiteralLike(node.initializer)) return undefined;
	return node.initializer;
}

function propertyNameText(name: ts.PropertyName): string | undefined {
	if (ts.isIdentifier(name)) return name.text;
	if (ts.isStringLiteralLike(name)) return name.text;
	return undefined;
}

function isSnakeCaseMachineValue(literal: ts.StringLiteralLike): boolean {
	return SNAKE_CASE_MACHINE_VALUE.test(literal.text);
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
	return { rule, ...sourceLocationFields(path, sourceFile, node) };
}

function buildViolationWithText(
	rule: string,
	path: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	text: string,
): SourceRuleViolation {
	const start = node.getStart(sourceFile);
	const position = sourceFile.getLineAndCharacterOfPosition(start);
	return {
		rule,
		path,
		line: position.line + 1,
		column: position.character + 1,
		text,
	};
}
