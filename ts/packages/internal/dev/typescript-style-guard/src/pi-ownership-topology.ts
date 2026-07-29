import * as ts from "typescript";

import {
	parseTypeScriptSource,
	sourceLocationFields,
} from "@nseng-ai/foundation/typescript-analysis";

import { BAN_PACKAGE_DISPOSITION_TOPOLOGY, manifestDependencyFields } from "./config.ts";
import { findManifestKeyPosition } from "./json-diagnostics.ts";
import {
	isRecord,
	packageNameForSpecifier,
	packageSubpathForSpecifier,
	type PackageMetadata,
} from "./package-metadata.ts";
import type { PackageTopologyFact } from "./package-disposition.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const PI_ADAPTER_PREFIX = "@nseng-ai/pi-ns-";
const PI_ADAPTER_LEAF_PREFIX = "pi-ns-";
const PI_EXTENSION_OWNER_PATH = "hosts/pi/extensions";
const PI_RUNTIME_PACKAGE = "@nseng-ai/pi-runtime";
const PI_SDK_PACKAGE_PREFIX = "@earendil-works/pi-";

export interface PackageSourceFile {
	readonly path: string;
	readonly content: string;
}

export interface PiOwnershipTopologyOptions {
	readonly metadataByName: ReadonlyMap<string, PackageMetadata>;
	readonly factByPackage: ReadonlyMap<string, PackageTopologyFact>;
	readonly sourceFiles: readonly PackageSourceFile[];
}

/** Enforces the complete ADR 0045 Pi/ns ownership boundary from derived package facts. */
export function collectPiOwnershipTopologyViolations(
	options: PiOwnershipTopologyOptions,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const sortedMetadata = [...options.metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);

	for (const metadata of sortedMetadata) {
		const fact = options.factByPackage.get(metadata.name);
		if (fact === undefined) continue;

		const isExtensionOwner = ownerPathText(fact) === "extensions";
		const isAdapterOwner = ownerPathText(fact) === PI_EXTENSION_OWNER_PATH;
		const isAdapterIdentity = unscopedName(metadata.name).startsWith(PI_ADAPTER_LEAF_PREFIX);

		if (isExtensionOwner && metadata.nsTier !== "extension") {
			violations.push(
				manifestViolation(
					metadata,
					["ns", "tier"],
					`${metadata.name} is owned by extensions/ and must declare ns.tier extension`,
				),
			);
		}

		if (isAdapterIdentity && !isAdapterOwner) {
			violations.push(
				manifestViolation(
					metadata,
					["name"],
					`${metadata.name} uses the pi-ns-* identity and must live directly under a hosts/pi/extensions owner path`,
				),
			);
		}

		if (isAdapterOwner) {
			violations.push(...collectAdapterManifestViolations(metadata, fact, options.metadataByName));
		}

		if (metadata.nsTier === "extension") {
			violations.push(...collectExtensionManifestViolations(metadata));
			violations.push(...collectExtensionSourceViolations(metadata, options.sourceFiles));
		}
		if (isAdapterOwner && metadata.name.startsWith(PI_ADAPTER_PREFIX)) {
			violations.push(
				...collectAdapterSourceViolations(metadata, options.metadataByName, options.sourceFiles),
			);
		}
	}

	return violations;
}

function collectAdapterManifestViolations(
	metadata: PackageMetadata,
	fact: PackageTopologyFact,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const domain = metadata.name.startsWith(PI_ADAPTER_PREFIX)
		? metadata.name.slice(PI_ADAPTER_PREFIX.length)
		: "";

	if (fact.disposition === "internal") {
		violations.push(
			manifestViolation(
				metadata,
				["name"],
				`${metadata.name} is a pi-ns-* adapter and must have public or incubating disposition`,
			),
		);
	}
	if (domain === "") {
		violations.push(
			manifestViolation(
				metadata,
				["name"],
				`${metadata.name} is under ${PI_EXTENSION_OWNER_PATH}/ and must be named @nseng-ai/pi-ns-<nonempty-domain>`,
			),
		);
	}
	if (metadata.nsTier !== "host") {
		violations.push(
			manifestViolation(metadata, ["ns", "tier"], `${metadata.name} must declare ns.tier host`),
		);
	}
	if (metadata.name.startsWith(PI_ADAPTER_PREFIX) && !hasPiExtensionEntrypoint(metadata)) {
		violations.push(
			manifestViolation(
				metadata,
				["pi", "extensions"],
				`${metadata.name} must declare at least one package-level pi.extensions entrypoint so Pi can load it as a standalone package`,
			),
		);
	}

	if (domain === "") return violations;

	const extensionName = `@nseng-ai/${domain}`;
	const extension = metadataByName.get(extensionName);
	if (extension?.nsTier !== "extension") {
		violations.push(
			manifestViolation(
				metadata,
				["name"],
				`${metadata.name} expects matching ns extension ${extensionName}`,
			),
		);
		return violations;
	}

	if (!hasRuntimeDependency(metadata, extensionName)) {
		const reason = hasDependency(metadata, "devDependencies", extensionName)
			? `declares its matching extension ${extensionName} only in devDependencies; devDependencies do not satisfy adapter composition`
			: `must runtime-depend on its matching ns extension ${extensionName}`;
		violations.push(manifestViolation(metadata, ["name"], `${metadata.name} ${reason}`));
	}

	return violations;
}

function collectExtensionManifestViolations(metadata: PackageMetadata): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];

	const piSubpackage = [...metadata.nsSubpackages].sort().find(isPiOwnedSubpackage);
	if (piSubpackage !== undefined) {
		violations.push(
			manifestViolation(
				metadata,
				["ns", "subpackages"],
				`${metadata.name} carries Pi-owned ns.subpackages entry ${piSubpackage}`,
			),
		);
	}

	for (const exportSubpath of [...metadata.exportSubpaths].sort()) {
		if (exportSubpath !== "./pi" && !exportSubpath.startsWith("./pi/")) continue;
		violations.push(
			manifestViolation(
				metadata,
				["exports", exportSubpath],
				`${metadata.name} carries Pi-owned export ${exportSubpath}`,
			),
		);
	}

	for (const field of manifestDependencyFields) {
		const dependencies = metadata.manifest[field];
		if (!isRecord(dependencies)) continue;
		for (const dependencyName of Object.keys(dependencies).sort()) {
			if (!isPiHostPackage(dependencyName)) continue;
			violations.push(
				manifestViolation(
					metadata,
					[field, dependencyName],
					`${metadata.name} must not runtime-depend on Pi host package ${dependencyName}`,
				),
			);
		}
	}

	return violations;
}

function collectExtensionSourceViolations(
	metadata: PackageMetadata,
	sourceFiles: readonly PackageSourceFile[],
): SourceRuleViolation[] {
	const files = filesForPackage(metadata, sourceFiles);
	const piPath = files.find((file) => isPiOwnedSourcePath(metadata, file.path));
	const violations: SourceRuleViolation[] = [];
	if (piPath !== undefined) {
		violations.push(
			sourceViolation(
				piPath.path,
				1,
				1,
				`${metadata.name} carries Pi-owned source path ${piPath.path}`,
			),
		);
	}

	for (const file of files) {
		const sourceFile = parseTypeScriptSource(file.path, file.content);
		visitModuleSpecifiers(sourceFile, (specifier, node) => {
			if (!isPiHostPackageSpecifier(specifier)) return;
			violations.push(
				sourceNodeViolation(
					file.path,
					sourceFile,
					node,
					`${metadata.name} imports Pi host code ${specifier}`,
				),
			);
		});
		visitPiRegistrationCalls(sourceFile, (node) => {
			violations.push(
				sourceNodeViolation(
					file.path,
					sourceFile,
					node,
					`${metadata.name} contains Pi host registration ${node.getText(sourceFile)}`,
				),
			);
		});
	}
	return violations;
}

function collectAdapterSourceViolations(
	adapter: PackageMetadata,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	sourceFiles: readonly PackageSourceFile[],
): SourceRuleViolation[] {
	const domain = adapter.name.slice(PI_ADAPTER_PREFIX.length);
	const matchingExtension = `@nseng-ai/${domain}`;
	const violations: SourceRuleViolation[] = [];

	for (const file of filesForPackage(adapter, sourceFiles)) {
		const sourceFile = parseTypeScriptSource(file.path, file.content);
		visitModuleSpecifiers(sourceFile, (specifier, node) => {
			const reason = adapterImportViolationReason(specifier, matchingExtension, metadataByName);
			if (reason === undefined) return;
			violations.push(
				sourceNodeViolation(file.path, sourceFile, node, `${adapter.name} ${reason}`),
			);
		});
	}
	return violations;
}

function adapterImportViolationReason(
	specifier: string,
	matchingExtension: string,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): string | undefined {
	const importedName = packageNameForSpecifier(specifier);
	if (importedName === undefined) return undefined;
	const importedMetadata = metadataByName.get(importedName);
	if (importedMetadata === undefined) return undefined;
	const subpath = packageSubpathForSpecifier(specifier, importedName);

	if (importedName === matchingExtension) {
		return subpath === "./api"
			? undefined
			: `must import its matching extension exactly through ${matchingExtension}/api, not ${specifier}`;
	}
	if (importedMetadata.nsTier === "extension") {
		return importedMetadata.exportSubpaths.has(subpath) && !isPrivateSubpath(subpath)
			? undefined
			: `imports ${specifier} from another ns extension through private or undeclared subpath ${subpath}`;
	}
	if (unscopedName(importedName).startsWith(PI_ADAPTER_LEAF_PREFIX)) {
		return importedMetadata.exportSubpaths.has(subpath) && !isPrivateSubpath(subpath)
			? undefined
			: `imports ${specifier}; adapter composition requires a declared curated export`;
	}
	return undefined;
}

function visitModuleSpecifiers(
	sourceFile: ts.SourceFile,
	visitSpecifier: (specifier: string, node: ts.StringLiteralLike) => void,
): void {
	function visit(node: ts.Node): void {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier !== undefined &&
			ts.isStringLiteralLike(node.moduleSpecifier)
		) {
			visitSpecifier(node.moduleSpecifier.text, node.moduleSpecifier);
		} else if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments.length === 1
		) {
			const argument = node.arguments[0];
			if (argument !== undefined && ts.isStringLiteralLike(argument)) {
				visitSpecifier(argument.text, argument);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
}

function visitPiRegistrationCalls(
	sourceFile: ts.SourceFile,
	visitRegistration: (node: ts.CallExpression) => void,
): void {
	function visit(node: ts.Node): void {
		if (ts.isCallExpression(node) && isPiRegistrationExpression(node.expression)) {
			visitRegistration(node);
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
}

function isPiRegistrationExpression(expression: ts.LeftHandSideExpression): boolean {
	if (ts.isPropertyAccessExpression(expression)) {
		return isPiApiReceiver(expression.expression) && isPiRegistrationMethod(expression.name.text);
	}
	if (ts.isElementAccessExpression(expression)) {
		const argument = expression.argumentExpression;
		return (
			isPiApiReceiver(expression.expression) &&
			argument !== undefined &&
			ts.isStringLiteralLike(argument) &&
			isPiRegistrationMethod(argument.text)
		);
	}
	return false;
}

function isPiApiReceiver(expression: ts.Expression): boolean {
	return (
		ts.isIdentifier(expression) && (expression.text === "pi" || expression.text === "extensionApi")
	);
}

function isPiRegistrationMethod(method: string): boolean {
	return method === "registerCommand" || method === "registerTool";
}

function filesForPackage(
	metadata: PackageMetadata,
	sourceFiles: readonly PackageSourceFile[],
): readonly PackageSourceFile[] {
	return sourceFiles
		.filter((file) => file.path.startsWith(`${metadata.packageDir}/`))
		.sort((left, right) => left.path.localeCompare(right.path));
}

function isPiOwnedSourcePath(metadata: PackageMetadata, path: string): boolean {
	const relativePath = path.slice(metadata.packageDir.length + 1);
	return relativePath === "src/pi" || relativePath.startsWith("src/pi/");
}

function isPiOwnedSubpackage(subpackage: string): boolean {
	return subpackage === "pi" || subpackage.startsWith("pi/");
}

function isPiHostPackage(packageName: string): boolean {
	return packageName === PI_RUNTIME_PACKAGE || packageName.startsWith(PI_SDK_PACKAGE_PREFIX);
}

function isPiHostPackageSpecifier(specifier: string): boolean {
	return (
		specifier === PI_RUNTIME_PACKAGE ||
		specifier.startsWith(`${PI_RUNTIME_PACKAGE}/`) ||
		specifier.startsWith(PI_SDK_PACKAGE_PREFIX)
	);
}

function isPrivateSubpath(subpath: string): boolean {
	return (
		subpath === "./src" ||
		subpath.startsWith("./src/") ||
		subpath === "./internal" ||
		subpath.startsWith("./internal/")
	);
}

function hasPiExtensionEntrypoint(metadata: PackageMetadata): boolean {
	const pi = metadata.manifest.pi;
	if (!isRecord(pi) || !Array.isArray(pi.extensions)) return false;
	return pi.extensions.some((entry) => typeof entry === "string" && entry.trim() !== "");
}

function hasRuntimeDependency(metadata: PackageMetadata, packageName: string): boolean {
	return manifestDependencyFields.some((field) => hasDependency(metadata, field, packageName));
}

function hasDependency(metadata: PackageMetadata, field: string, packageName: string): boolean {
	const dependencies = metadata.manifest[field];
	return isRecord(dependencies) && packageName in dependencies;
}

function ownerPathText(fact: PackageTopologyFact): string {
	return fact.ownerPath.join("/");
}

function unscopedName(packageName: string): string {
	return packageName.slice(packageName.indexOf("/") + 1);
}

function manifestViolation(
	metadata: PackageMetadata,
	keys: readonly string[],
	reason: string,
): SourceRuleViolation {
	const position = findManifestKeyPosition(metadata.manifestContent, keys);
	return {
		rule: BAN_PACKAGE_DISPOSITION_TOPOLOGY,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${reason} (ADR 0045 §5).`,
	};
}

function sourceNodeViolation(
	path: string,
	sourceFile: ts.SourceFile,
	node: ts.Node,
	reason: string,
): SourceRuleViolation {
	const location = sourceLocationFields(path, sourceFile, node);
	return sourceViolation(path, location.line, location.column, reason);
}

function sourceViolation(
	path: string,
	line: number,
	column: number,
	reason: string,
): SourceRuleViolation {
	return {
		rule: BAN_PACKAGE_DISPOSITION_TOPOLOGY,
		path,
		line,
		column,
		text: `${reason}; ns extensions are harness-independent and Pi integration belongs under hosts/pi/extensions (ADR 0045 §5).`,
	};
}
