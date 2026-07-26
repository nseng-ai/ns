import { nsExtensionExportTarget } from "@nseng-ai/sdk/project-config";
import * as ts from "typescript";

import {
	BAN_AS_UNKNOWN_AS,
	BAN_EMPTY_INTERFACE_EXTENDS,
	BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT,
	BAN_EXTENSION_PRIVATE_PEER_IMPORT,
	BAN_IMPORT_ALIAS_FOR_FIRST_PARTY,
	BAN_LOWER_LAYER_CONCRETE_EXTENSION_SURFACE,
	BAN_RAW_PRODUCTION_TIMERS,
	BAN_SHARED_TEST_FAKE_TIMERS,
	BAN_SHARED_TEST_GLOBAL_LISTENERS,
	BAN_SHARED_TEST_MODULE_STATE,
	BAN_SHARED_TEST_PROCESS_MUTATION,
	BAN_SHARED_TEST_SINGLETON_STATE,
	BAN_SNAKE_CASE_CLI_MACHINE_VALUE,
	type ConcreteExtensionCommandSurface,
	concreteExtensionCommandSurfaces,
	extensionPackageNames,
	standaloneToolCommandSurfaces,
} from "./config.ts";
import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "@nseng-ai/foundation/typescript-analysis";
import {
	packageNameForPath,
	packageNameForSpecifier,
	packageSubpathForSpecifier,
	type PackageMetadata,
} from "./package-metadata.ts";
import type { PackageTierId } from "./package-tier-taxonomy.ts";

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

		if (isSharedTestModuleStateNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_SHARED_TEST_MODULE_STATE,
					path,
					sourceFile,
					node,
					"Shared-cache tests must not mutate Vitest module state. Prefer an injected fake, or move a test whose subject is import binding or module loading under test/isolated/.",
				),
			);
		}

		if (isSharedTestFakeTimerNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_SHARED_TEST_FAKE_TIMERS,
					path,
					sourceFile,
					node,
					"Shared-cache tests must not install Vitest fake timers. Inject TimerScheduler and use createManualTimerScheduler(), or isolate host-owned timer behavior under test/isolated/.",
				),
			);
		}

		if (isSharedTestProcessMutationNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_SHARED_TEST_PROCESS_MUTATION,
					path,
					sourceFile,
					node,
					"Shared-cache tests must not mutate process.env or cwd directly. Pass env/cwd through an existing seam, use vi.stubEnv(), or isolate genuinely ambient behavior under test/isolated/.",
				),
			);
		}

		if (isSharedTestGlobalListenerNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_SHARED_TEST_GLOBAL_LISTENERS,
					path,
					sourceFile,
					node,
					"Shared-cache tests must not mutate process-global listeners. Inject an event source, or move a test whose subject is process listener behavior under test/isolated/.",
				),
			);
		}

		if (isSharedTestSingletonStateNode(node, path)) {
			violations.push(
				buildViolationWithText(
					BAN_SHARED_TEST_SINGLETON_STATE,
					path,
					sourceFile,
					node,
					"Shared-cache tests must not exercise the module-global Graphite metadata worker lifecycle. Inject an owned worker seam or move focused lifecycle coverage under test/isolated/.",
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

		if (
			ts.isImportDeclaration(node) &&
			isExtensionDescriptorForbiddenStaticImport(node, path, packageMetadataByName)
		) {
			violations.push(
				buildViolationWithText(
					BAN_EXTENSION_DESCRIPTOR_STATIC_IMPORT,
					path,
					sourceFile,
					node.moduleSpecifier,
					"First-party ns-extension descriptor modules may statically import only @nseng-ai/sdk; keep implementation modules behind descriptor load thunks.",
				),
			);
		}

		if (ts.isInterfaceDeclaration(node) && node.members.length === 0 && hasExtendsClause(node)) {
			violations.push(buildViolation(BAN_EMPTY_INTERFACE_EXTENDS, path, sourceFile, node));
		}

		if (
			ts.isImportDeclaration(node) &&
			isPrivateExtensionPeerImport(node, path, packageMetadataByName)
		) {
			violations.push(
				buildViolation(BAN_EXTENSION_PRIVATE_PEER_IMPORT, path, sourceFile, node.moduleSpecifier),
			);
		}

		if (isAsUnknownAsExpression(node)) {
			violations.push(buildViolation(BAN_AS_UNKNOWN_AS, path, sourceFile, node));
		}

		if (isLowerLayerConcreteExtensionSurfaceNode(node, path, packageMetadataByName)) {
			violations.push(
				buildViolationWithText(
					BAN_LOWER_LAYER_CONCRETE_EXTENSION_SURFACE,
					path,
					sourceFile,
					node,
					"Lower-layer production source must not import or encode concrete extension package/command surfaces; keep ownership in the contributing extension package.",
				),
			);
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
const SHARED_TEST_MODULE_STATE_METHODS = new Set([
	"mock",
	"doMock",
	"unmock",
	"doUnmock",
	"resetModules",
]);
const SHARED_TEST_FAKE_TIMER_METHODS = new Set(["useFakeTimers", "useRealTimers"]);
const PROCESS_GLOBAL_LISTENER_METHODS = new Set([
	"on",
	"once",
	"addListener",
	"prependListener",
	"removeListener",
	"off",
	"removeAllListeners",
]);
const GRAPHITE_METADATA_SINGLETON_METHODS = new Set([
	"loadGraphiteMetadataStatusInWorker",
	"shutdownGraphiteMetadataWorker",
]);
const DESCRIPTOR_ALLOWED_VALUE_IMPORT = "@nseng-ai/sdk";
const LOWER_LAYER_SURFACE_TIERS = new Set<PackageTierId>(["neutral-infra", "sdk", "extension-kit"]);
const RAW_TIMER_ADAPTER_PATHS = new Set([
	"ts/packages/public/infra/foundation/src/time/index.ts",
	"ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/kit/shared/timers.ts",
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

function isSharedTestModuleStateNode(node: ts.Node, path: string): boolean {
	return (
		isSharedTestStateGuardPath(path) &&
		ts.isCallExpression(node) &&
		SHARED_TEST_MODULE_STATE_METHODS.has(staticMemberCallName(node, "vi") ?? "")
	);
}

function isSharedTestFakeTimerNode(node: ts.Node, path: string): boolean {
	return (
		isSharedTestStateGuardPath(path) &&
		ts.isCallExpression(node) &&
		SHARED_TEST_FAKE_TIMER_METHODS.has(staticMemberCallName(node, "vi") ?? "")
	);
}

function isSharedTestProcessMutationNode(node: ts.Node, path: string): boolean {
	if (!isSharedTestStateGuardPath(path)) return false;
	if (ts.isCallExpression(node) && staticMemberCallName(node, "process") === "chdir") return true;
	if (ts.isDeleteExpression(node)) return isRootedAtProcessEnv(node.expression);
	return (
		ts.isBinaryExpression(node) &&
		isAssignmentOperator(node.operatorToken.kind) &&
		isRootedAtProcessEnv(node.left)
	);
}

function isSharedTestGlobalListenerNode(node: ts.Node, path: string): boolean {
	return (
		isSharedTestStateGuardPath(path) &&
		ts.isCallExpression(node) &&
		PROCESS_GLOBAL_LISTENER_METHODS.has(staticMemberCallName(node, "process") ?? "")
	);
}

function isSharedTestSingletonStateNode(node: ts.Node, path: string): boolean {
	return (
		isSharedTestStateGuardPath(path) &&
		ts.isCallExpression(node) &&
		ts.isIdentifier(node.expression) &&
		GRAPHITE_METADATA_SINGLETON_METHODS.has(node.expression.text)
	);
}

function isSharedTestStateGuardPath(path: string): boolean {
	return (
		path.startsWith("ts/packages/") && path.includes("/test/") && !path.includes("/test/isolated/")
	);
}

function staticMemberCallName(node: ts.CallExpression, owner: string): string | undefined {
	const expression = node.expression;
	if (ts.isPropertyAccessExpression(expression)) {
		return ts.isIdentifier(expression.expression) && expression.expression.text === owner
			? expression.name.text
			: undefined;
	}
	if (!ts.isElementAccessExpression(expression)) return undefined;
	if (!ts.isIdentifier(expression.expression) || expression.expression.text !== owner)
		return undefined;
	return staticPropertyName(expression.argumentExpression);
}

function staticPropertyName(expression: ts.Expression | undefined): string | undefined {
	if (expression === undefined || !ts.isStringLiteralLike(expression)) return undefined;
	return expression.text;
}

function isRootedAtProcessEnv(expression: ts.Expression): boolean {
	const unwrapped = unwrapParentheses(expression);
	if (isProcessEnvAccess(unwrapped)) return true;
	if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
		return isRootedAtProcessEnv(unwrapped.expression);
	}
	return false;
}

function isProcessEnvAccess(expression: ts.Expression): boolean {
	if (ts.isPropertyAccessExpression(expression)) {
		return (
			ts.isIdentifier(expression.expression) &&
			expression.expression.text === "process" &&
			expression.name.text === "env"
		);
	}
	return (
		ts.isElementAccessExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		expression.expression.text === "process" &&
		staticPropertyName(expression.argumentExpression) === "env"
	);
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
	return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
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

function isExtensionDescriptorForbiddenStaticImport(
	node: ts.ImportDeclaration,
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	if (!isFirstPartyExtensionDescriptorPath(path, packageMetadataByName)) return false;
	if (!hasRuntimeImportBinding(node)) return false;
	const specifier = moduleSpecifierText(node);
	if (specifier === undefined) return false;
	return specifier !== DESCRIPTOR_ALLOWED_VALUE_IMPORT;
}

function hasRuntimeImportBinding(node: ts.ImportDeclaration): boolean {
	const importClause = node.importClause;
	if (importClause === undefined) return true;
	if (importClause.isTypeOnly) return false;
	if (importClause.name !== undefined) return true;
	const namedBindings = importClause.namedBindings;
	if (namedBindings === undefined) return false;
	if (ts.isNamespaceImport(namedBindings)) return true;
	return namedBindings.elements.some((element) => !element.isTypeOnly);
}

function isFirstPartyExtensionDescriptorPath(
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	if (!path.startsWith("ts/packages/")) return false;
	const packageName = packageNameForPath(path, packageMetadataByName);
	if (packageName === undefined) return false;
	const metadata = packageMetadataByName.get(packageName);
	if (metadata === undefined) return false;
	const descriptorExport = nsExtensionExportTarget(metadata.manifest.exports);
	if (descriptorExport === undefined) return false;
	return path === `${metadata.packageDir}/${descriptorExport.replace(/^\.\//, "")}`;
}

function isLowerLayerConcreteExtensionSurfaceNode(
	node: ts.Node,
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	if (!isLowerLayerProductionSourcePath(path, packageMetadataByName)) return false;
	const literal = stringLiteralText(node);
	if (literal === undefined) return false;
	return (
		isConcreteExtensionPackageSpecifier(literal) ||
		isConcreteExtensionCommandSurfaceLiteral(literal)
	);
}

function isLowerLayerProductionSourcePath(
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	if (path.includes("/test/") || path.includes("/test-support/")) return false;
	const packageName = packageNameForPath(path, packageMetadataByName);
	if (packageName === undefined) return false;
	const metadata = packageMetadataByName.get(packageName);
	return metadata?.nsTier !== undefined && LOWER_LAYER_SURFACE_TIERS.has(metadata.nsTier);
}

function stringLiteralText(node: ts.Node): string | undefined {
	return ts.isStringLiteralLike(node) ? node.text : undefined;
}

function isConcreteExtensionPackageSpecifier(value: string): boolean {
	const packageName = packageNameForSpecifier(value);
	if (packageName === undefined) return false;
	return isConcreteSurfacePackageName(packageName);
}

function isConcreteSurfacePackageName(packageName: string): boolean {
	return (
		extensionPackageNames.has(packageName) ||
		standaloneToolCommandSurfaces.some((surface) => surface.packageName === packageName)
	);
}

function isConcreteExtensionCommandSurfaceLiteral(value: string): boolean {
	const nsColonMatch = value.match(/(?:^|\/)ns:([a-z0-9-]+)/);
	if (nsColonMatch?.[1] !== undefined && hasConcreteSlashPrefix(nsColonMatch[1])) return true;

	const normalized = value.startsWith("ns ") ? value.slice(3) : value;
	const firstSegment = normalized.split(/[\s/]/, 1)[0];
	if (firstSegment === undefined) return false;
	return hasConcreteCliPrefix(firstSegment) && normalized !== value;
}

function hasConcreteSlashPrefix(prefix: string): boolean {
	return hasConcretePrefix(prefix, (surface) => surface.slashPrefixes);
}

function hasConcreteCliPrefix(prefix: string): boolean {
	return hasConcretePrefix(prefix, (surface) => surface.cliPrefixes);
}

function hasConcretePrefix(
	prefix: string,
	prefixesOf: (surface: ConcreteExtensionCommandSurface) => readonly string[],
): boolean {
	return allConcreteCommandSurfaces().some((surface) => prefixesOf(surface).includes(prefix));
}

function allConcreteCommandSurfaces(): readonly ConcreteExtensionCommandSurface[] {
	return [...concreteExtensionCommandSurfaces, ...standaloneToolCommandSurfaces];
}

function isPrivateExtensionPeerImport(
	node: ts.ImportDeclaration,
	path: string,
	packageMetadataByName: ReadonlyMap<string, PackageMetadata>,
): boolean {
	const specifier = moduleSpecifierText(node);
	if (specifier === undefined) return false;

	const importerPackageName = packageNameForPath(path, packageMetadataByName);
	if (importerPackageName === undefined) return false;
	const importerPackageMetadata = packageMetadataByName.get(importerPackageName);
	if (importerPackageMetadata?.nsTier !== "extension") return false;

	const importedPackageName = packageNameForSpecifier(specifier);
	if (importedPackageName === undefined) return false;
	if (importedPackageName === importerPackageName) return false;
	const importedPackageMetadata = packageMetadataByName.get(importedPackageName);
	if (importedPackageMetadata?.nsTier === "neutral-infra") return false;
	if (importedPackageMetadata?.nsTier === "extension-kit") return false;
	if (importedPackageName === "@nseng-ai/sdk") return false;
	if (importedPackageMetadata?.nsTier !== "extension") return false;

	const importedSubpath = packageSubpathForSpecifier(specifier, importedPackageName);
	if (importedSubpath === ".") return false;
	if (importedSubpath === "./api") return false;
	if (isPrivateExtensionSubpath(importedSubpath)) return true;

	return !importedPackageMetadata.exportSubpaths.has(importedSubpath);
}

function isPrivateExtensionSubpath(subpath: string): boolean {
	return (
		subpath.startsWith("./src/") || subpath === "./internal" || subpath.startsWith("./internal/")
	);
}

function isFirstPartyModuleSpecifier(specifier: string): boolean {
	return (
		specifier.startsWith(".") ||
		specifier.startsWith("/") ||
		specifier.startsWith("@/") ||
		specifier.startsWith("@nseng-ai/") ||
		specifier.startsWith("@internal/")
	);
}

function hasExtendsClause(node: ts.InterfaceDeclaration): boolean {
	return (
		node.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword) === true
	);
}

// ns-owned serialized CLI machine-contract enum values must be kebab-case, not
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
