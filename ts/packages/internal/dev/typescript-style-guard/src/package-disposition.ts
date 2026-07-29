import { readFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

import * as ts from "typescript";

import {
	moduleSpecifierText,
	parseTypeScriptSource,
	sourceLocationFields,
} from "@nseng-ai/foundation/typescript-analysis";

import {
	BAN_EXTENSION_PI_SURFACE,
	BAN_PACKAGE_DISPOSITION_TOPOLOGY,
	BAN_PI_ADAPTER_EXTENSION_IMPORT,
	manifestDependencyFields,
} from "./config.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { findTypeScriptSourceFiles } from "./file-discovery.ts";
import { findManifestKeyPosition } from "./json-diagnostics.ts";
import {
	isRecord,
	packageNameForSpecifier,
	packageSubpathForSpecifier,
	type PackageMetadata,
} from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";
import {
	collectPiOwnershipTopologyViolations,
	type PackageSourceFile,
} from "./pi-ownership-topology.ts";

const PACKAGES_ROOT = "ts/packages";
const PI_HOST_RUNTIME_PACKAGE = "@nseng-ai/pi-runtime";
const PI_ADAPTER_NAME_PREFIX = "pi-ns-";

/**
 * ADR 0045 §1: the first path segment below `ts/packages/` is release disposition, and
 * nothing else. Disposition is path-derived — it is not an `ns.tier` value, a manifest
 * field, or an allowlist — so this list is the single typed source for the three roots.
 */
export const packageDispositionIds = ["public", "incubating", "internal"] as const;

export type PackageDispositionId = (typeof packageDispositionIds)[number];

interface PackageDispositionDefinition {
	/** ADR 0045 §3: scope follows disposition, with no per-package exceptions. */
	readonly scope: string;
	/**
	 * ADR 0045 §3 requires `private: true` for internal packages only. `private` is
	 * otherwise orthogonal to disposition: a public- or incubating-disposition package may
	 * legitimately be private-for-now, so the rule never asserts `private: false`.
	 */
	readonly requiresPrivate: boolean;
	/** ADR 0045 §4 closure matrix, consumer -> allowed providers. */
	readonly allowedProviders: readonly PackageDispositionId[];
}

const packageDispositionDefinitions: Readonly<
	Record<PackageDispositionId, PackageDispositionDefinition>
> = {
	public: {
		scope: "@nseng-ai",
		requiresPrivate: false,
		allowedProviders: ["public"],
	},
	incubating: {
		scope: "@nseng-ai",
		requiresPrivate: false,
		allowedProviders: ["public", "incubating"],
	},
	internal: {
		scope: "@internal",
		requiresPrivate: true,
		allowedProviders: ["public", "incubating", "internal"],
	},
};

export function parsePackageDisposition(value: string): PackageDispositionId | undefined {
	return packageDispositionIds.find((id) => id === value);
}

/**
 * The typed package-topology model ADR 0045 §4 asks for: one parse of a package directory,
 * reused by every disposition check so no check re-derives disposition from loose string
 * literals.
 */
export interface PackageTopologyFact {
	readonly name: string;
	readonly disposition: PackageDispositionId;
	/** Owner segments between the disposition root and the leaf; may be empty (`public/sdk`). */
	readonly ownerPath: readonly string[];
	readonly leaf: string;
}

type ParsedPackagePath =
	| { readonly kind: "rooted"; readonly fact: Omit<PackageTopologyFact, "name"> }
	| { readonly kind: "unrooted"; readonly reason: string };

/**
 * Enforces the ADR 0045 package ontology over already-loaded manifest metadata:
 *
 * 1. every package sits under exactly one disposition root (`public`, `incubating`,
 *    `internal`) — an unrecognized first segment is a violation, not a skip, which is what
 *    makes the ontology closed rather than advisory;
 * 2. the leaf directory equals the unscoped npm name;
 * 3. leaf identities are globally unique across all three trees;
 * 4. scope agrees with disposition, and `@internal/*` is private;
 * 5. runtime workspace dependency edges obey the disposition closure matrix.
 *
 * **devDependencies are deliberately out of scope.** ADR 0045 §4 scopes closure to
 * "`dependencies`, `optionalDependencies`, and runtime `peerDependencies`" and states that
 * "development-only and test-only edges may cross inward when they cannot affect a produced
 * package, but the guard must distinguish those edges mechanically rather than by
 * convention." `manifestDependencyFields` is that mechanical distinction: it is the runtime
 * field list, and `devDependencies` is absent from it. A public package may therefore
 * devDepend on an internal tool. `peerDependencies` is treated as runtime in full, matching
 * `NS_TS_PACKAGE_TIER_LAYERING`; an optional peer still ships as a resolved edge.
 *
 * 6. ns extension packages contain no Pi-owned manifest or source surfaces;
 * 7. each `pi-ns-<domain>` package is a host-tier Pi adapter over exactly
 *    `@nseng-ai/<domain>/api`, with a runtime workspace edge to that extension.
 *
 * The two ADR 0045 §5 rules that were deferred until the `pi-ns-*` extraction landed live
 * alongside this collector:
 *
 * - `collectExtensionPiSurfaceViolations` — the structural rule that no ns extension carries
 *   a `pi` subpackage, a `./pi`/`./pi/*` export, or a runtime Pi dependency;
 * - `collectPiAdapterExtensionImportViolations` — the `pi-ns-*` adapter rule (an adapter may
 *   import an ns extension only through its curated API, never deep or private extension
 *   source; everything else is governed by disposition closure and the other guards).
 *
 * Source-bearing checks use the caller-provided tracked TypeScript facts. The repository suite
 * supplies every discovered source file; callers that only need manifest topology may omit them.
 *
 * This rule overlaps `NS_TS_INTERNAL_SPACE_ADMISSION` on the internal scope/private pair and
 * on inbound edges to `@internal/*`. That overlap is intentional: the older rule states the
 * internal-space contract on its own terms, this one derives the same facts from the
 * disposition model, and neither can be relaxed without the other noticing.
 */
export function collectPackageDispositionViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	sourceFiles: readonly PackageSourceFile[] = [],
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const factByPackage = new Map<string, PackageTopologyFact>();

	for (const metadata of sortedMetadata(metadataByName)) {
		const parsed = parsePackagePath(metadata.packageDir);
		if (parsed.kind === "unrooted") {
			violations.push(buildManifestViolation(metadata, ["name"], parsed.reason));
			continue;
		}
		const fact: PackageTopologyFact = { name: metadata.name, ...parsed.fact };
		factByPackage.set(metadata.name, fact);
		violations.push(...collectIdentityViolations(metadata, fact));
	}

	violations.push(...collectDuplicateLeafViolations(metadataByName, factByPackage));
	violations.push(...collectClosureViolations(metadataByName, factByPackage));
	violations.push(
		...collectPiOwnershipTopologyViolations({ metadataByName, factByPackage, sourceFiles }),
	);

	return violations;
}

/**
 * Parses `ts/packages/<disposition>/<owner...>/<leaf>`. Owner nesting is free-form by ADR
 * 0045 §2 — hosts own the categories below their root and need not mirror Pi — so depth is
 * unconstrained, but a disposition root with no leaf below it is not a package home.
 */
function parsePackagePath(packageDir: string): ParsedPackagePath {
	const prefix = `${PACKAGES_ROOT}/`;
	if (!packageDir.startsWith(prefix)) {
		return {
			kind: "unrooted",
			reason: `lives at ${packageDir}, outside ${PACKAGES_ROOT}/; every first-party workspace package lives under a disposition root (${packageDispositionIds.join(", ")})`,
		};
	}

	const [rootSegment, ...rest] = packageDir.slice(prefix.length).split("/");
	const disposition = rootSegment === undefined ? undefined : parsePackageDisposition(rootSegment);
	if (disposition === undefined) {
		return {
			kind: "unrooted",
			reason: `lives at ${packageDir}; the first path segment below ${PACKAGES_ROOT}/ must be exactly one of ${packageDispositionIds.join(", ")}`,
		};
	}
	const leaf = rest.at(-1);
	if (leaf === undefined) {
		return {
			kind: "unrooted",
			reason: `lives at the ${disposition} disposition root itself; a package needs its own leaf directory below ${PACKAGES_ROOT}/${disposition}/`,
		};
	}

	return {
		kind: "rooted",
		fact: { disposition, ownerPath: rest.slice(0, -1), leaf },
	};
}

function collectIdentityViolations(
	metadata: PackageMetadata,
	fact: PackageTopologyFact,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const definition = packageDispositionDefinitions[fact.disposition];
	const identity = parsePackageIdentity(metadata.name);

	if (identity.scope !== definition.scope) {
		violations.push(
			buildManifestViolation(
				metadata,
				["name"],
				`is ${fact.disposition}, which requires the ${definition.scope}/ scope, but its npm scope is ${identity.scope === "" ? "absent" : `${identity.scope}/`}`,
			),
		);
	}
	if (identity.unscopedName !== fact.leaf) {
		violations.push(
			buildManifestViolation(
				metadata,
				["name"],
				`lives at ${metadata.packageDir}, but its leaf directory ${fact.leaf} must equal the unscoped package name ${identity.unscopedName}`,
			),
		);
	}
	if (definition.requiresPrivate && metadata.manifest.private !== true) {
		violations.push(
			buildManifestViolation(
				metadata,
				["private"],
				`is ${fact.disposition} and must declare "private": true; internal packages are never published`,
			),
		);
	}

	return violations;
}

/**
 * ADR 0045 §3: leaf identities are globally unique across all three disposition trees.
 * Keyed on the leaf directory rather than the unscoped npm name so that two same-named
 * leaves under different scopes still collide; a package whose leaf and name disagree has
 * already been reported by the identity check.
 */
function collectDuplicateLeafViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	factByPackage: ReadonlyMap<string, PackageTopologyFact>,
): SourceRuleViolation[] {
	const namesByLeaf = new Map<string, string[]>();
	for (const fact of factByPackage.values()) {
		const names = namesByLeaf.get(fact.leaf);
		if (names === undefined) namesByLeaf.set(fact.leaf, [fact.name]);
		else names.push(fact.name);
	}

	const violations: SourceRuleViolation[] = [];
	for (const [leaf, names] of [...namesByLeaf].sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		if (names.length < 2) continue;
		for (const name of [...names].sort()) {
			const metadata = metadataByName.get(name);
			if (metadata === undefined) continue;
			const others = names.filter((other) => other !== name).sort();
			violations.push(
				buildManifestViolation(
					metadata,
					["name"],
					`shares leaf directory ${leaf} with ${others.join(", ")}; package leaf identities are globally unique across the ${packageDispositionIds.join(", ")} trees`,
				),
			);
		}
	}
	return violations;
}

function collectClosureViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
	factByPackage: ReadonlyMap<string, PackageTopologyFact>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const edges = collectExtensionManifestWorkspaceEdges(
		metadataByName,
		new Set(metadataByName.keys()),
	);

	for (const edge of edges) {
		const consumer = factByPackage.get(edge.from);
		const provider = factByPackage.get(edge.to);
		// An unrooted package on either end already has its own violation; guessing a
		// disposition for it would report the same defect twice in two vocabularies.
		if (consumer === undefined || provider === undefined) continue;
		const definition = packageDispositionDefinitions[consumer.disposition];
		if (definition.allowedProviders.includes(provider.disposition)) continue;
		violations.push({
			rule: BAN_PACKAGE_DISPOSITION_TOPOLOGY,
			path: edge.path,
			line: edge.line,
			column: edge.column,
			text: `${edge.from} (${consumer.disposition}) -> ${edge.to} (${provider.disposition}) at ${edge.manifestPath} violates disposition closure ${consumer.disposition}-must-not-depend-on-${provider.disposition}. A ${consumer.disposition} package may runtime-depend on: ${definition.allowedProviders.join(", ")}. Closure covers ${manifestDependencyFields.join(", ")}; devDependencies may cross inward.`,
		});
	}

	return violations;
}

/**
 * ADR 0045 §5 structural rule: ns extensions are harness-independent domain owners, so an
 * `ns.tier === "extension"` package must not carry Pi host coupling in its manifest:
 *
 * 1. no `"pi"` entry in `ns.subpackages`;
 * 2. no `./pi` export and no export under `./pi/`; the match is `./pi` | `./pi/*`, never a
 *    raw prefix, so names like `./pi-launch` stay legal (extension-kit declares them, and an
 *    extension could legitimately name an unrelated subpath `./pi-something`);
 * 3. no runtime dependency on `@nseng-ai/pi-runtime` (`dependencies`,
 *    `optionalDependencies`, or `peerDependencies`); host integration lives in a separately
 *    owned `pi-ns-*` adapter package.
 */
export function collectExtensionPiSurfaceViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];

	for (const metadata of sortedMetadata(metadataByName)) {
		if (metadata.nsTier !== "extension") continue;

		if (metadata.nsSubpackages.includes("pi")) {
			violations.push(
				buildExtensionPiSurfaceViolation(
					metadata,
					["ns", "subpackages"],
					'declares "pi" in ns.subpackages',
				),
			);
		}

		for (const exportKey of [...metadata.exportSubpaths].sort()) {
			if (exportKey !== "./pi" && !exportKey.startsWith("./pi/")) continue;
			violations.push(
				buildExtensionPiSurfaceViolation(
					metadata,
					["exports", exportKey],
					`declares the ${exportKey} export subpath`,
				),
			);
		}

		for (const field of manifestDependencyFields) {
			const dependencies = metadata.manifest[field];
			if (!isRecord(dependencies) || !(PI_HOST_RUNTIME_PACKAGE in dependencies)) continue;
			violations.push(
				buildExtensionPiSurfaceViolation(
					metadata,
					[field, PI_HOST_RUNTIME_PACKAGE],
					`declares ${PI_HOST_RUNTIME_PACKAGE} in ${field}`,
				),
			);
		}
	}

	return violations;
}

export interface PiAdapterSourceFile {
	readonly path: string;
	readonly content: string;
}

export interface PiAdapterExtensionImportOptions {
	readonly repoRoot: string;
	readonly packageMetadataByName: ReadonlyMap<string, PackageMetadata>;
	/** Injected sources for tests; when absent the adapters' packageDirs are scanned. */
	readonly files?: readonly PiAdapterSourceFile[];
}

/**
 * ADR 0045 §5 adapter rule: a `pi-ns-*` host adapter "consume[s] only curated extension
 * package APIs". Concretely, for every import in an adapter's TypeScript sources that
 * targets a workspace package with `ns.tier === "extension"`:
 *
 * - production source must import exactly `<package>/api` or a declared subpath under
 *   `<package>/api/`;
 * - test files (under `test/`) may additionally use the extension's other declared export
 *   subpaths — `./testing` is the curated test-support surface — but never deep or private
 *   source (`./src/*`, `./internal*`, or an undeclared subpath);
 * - relative imports that escape the adapter's package directory into another workspace
 *   package's source are deep imports by construction and always violations.
 *
 * Imports of non-extension packages (foundation, pi-runtime, extension-kit, sdk, other
 * `pi-ns-*` adapters — the blessed adapter-to-adapter edges ride on declared curated
 * subpaths) are governed by disposition closure and the other guards, not this rule.
 */
export function collectPiAdapterExtensionImportViolations(
	options: PiAdapterExtensionImportOptions,
): SourceRuleViolation[] {
	const adapters = sortedMetadata(options.packageMetadataByName).filter((metadata) =>
		parsePackageIdentity(metadata.name).unscopedName.startsWith(PI_ADAPTER_NAME_PREFIX),
	);
	const violations: SourceRuleViolation[] = [];

	for (const adapter of adapters) {
		const files = options.files ?? readAdapterSourceFiles(options.repoRoot, adapter);
		for (const file of files) {
			if (!isWithinDirectory(file.path, adapter.packageDir)) continue;
			violations.push(
				...collectAdapterFileViolations(file, adapter, options.packageMetadataByName),
			);
		}
	}

	return violations;
}

function readAdapterSourceFiles(
	repoRoot: string,
	adapter: PackageMetadata,
): readonly PiAdapterSourceFile[] {
	return findTypeScriptSourceFiles(join(repoRoot, adapter.packageDir)).map((absolutePath) => ({
		path: relative(repoRoot, absolutePath),
		content: readFileSync(absolutePath, "utf8"),
	}));
}

function collectAdapterFileViolations(
	file: PiAdapterSourceFile,
	adapter: PackageMetadata,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const sourceFile = parseTypeScriptSource(file.path, file.content);
	const isTestFile = file.path.includes("/test/");
	const violations: SourceRuleViolation[] = [];

	function visit(node: ts.Node): void {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			const specifierNode = node.moduleSpecifier;
			const specifier = moduleSpecifierText(node);
			if (specifier !== undefined && specifierNode !== undefined) {
				const reason = adapterImportViolationReason(
					specifier,
					file.path,
					adapter,
					isTestFile,
					metadataByName,
				);
				if (reason !== undefined) {
					violations.push({
						rule: BAN_PI_ADAPTER_EXTENSION_IMPORT,
						...sourceLocationFields(file.path, sourceFile, specifierNode),
						text: `${adapter.name} ${reason} (ADR 0045 §5).`,
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return violations;
}

function adapterImportViolationReason(
	specifier: string,
	importerPath: string,
	adapter: PackageMetadata,
	isTestFile: boolean,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): string | undefined {
	if (specifier.startsWith(".")) {
		return relativeEscapeViolationReason(specifier, importerPath, adapter, metadataByName);
	}

	const importedPackageName = packageNameForSpecifier(specifier);
	if (importedPackageName === undefined) return undefined;
	const importedMetadata = metadataByName.get(importedPackageName);
	if (importedMetadata?.nsTier !== "extension") return undefined;

	const subpath = packageSubpathForSpecifier(specifier, importedPackageName);
	if (subpath === "./api" || subpath.startsWith("./api/")) {
		if (importedMetadata.exportSubpaths.has(subpath)) return undefined;
		return `imports ${specifier}, which is not a declared export subpath of ${importedPackageName}; a pi-ns-* adapter may consume only the extension's curated API`;
	}

	if (!isTestFile) {
		return `imports ${specifier} from production source, but a pi-ns-* adapter may consume an ns extension only through its curated API subpath (${importedPackageName}/api)`;
	}
	if (isPrivateExtensionImportSubpath(subpath) || !importedMetadata.exportSubpaths.has(subpath)) {
		return `imports ${specifier} from a test file; deep or private extension imports are banned even in adapter tests — use a declared curated subpath such as ${importedPackageName}/api or ${importedPackageName}/testing`;
	}
	return undefined;
}

function relativeEscapeViolationReason(
	specifier: string,
	importerPath: string,
	adapter: PackageMetadata,
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): string | undefined {
	const resolvedPath = normalize(join(dirname(importerPath), specifier));
	if (isWithinDirectory(resolvedPath, adapter.packageDir)) return undefined;
	for (const metadata of metadataByName.values()) {
		if (metadata.name === adapter.name) continue;
		if (!isWithinDirectory(resolvedPath, metadata.packageDir)) continue;
		return `relative import ${specifier} escapes the adapter package directory into ${metadata.name} source; import the package's curated API instead`;
	}
	return undefined;
}

function isPrivateExtensionImportSubpath(subpath: string): boolean {
	return (
		subpath.startsWith("./src/") || subpath === "./internal" || subpath.startsWith("./internal/")
	);
}

function isWithinDirectory(path: string, directory: string): boolean {
	return path === directory || path.startsWith(`${directory}/`);
}

function buildExtensionPiSurfaceViolation(
	metadata: PackageMetadata,
	keys: readonly string[],
	reason: string,
): SourceRuleViolation {
	const position = findManifestKeyPosition(metadata.manifestContent, keys);
	return {
		rule: BAN_EXTENSION_PI_SURFACE,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} is an ns extension (ns.tier extension) and ${reason}; ns extensions are harness-independent, so Pi host integration belongs in a separately owned pi-ns-* adapter package (ADR 0045 §5).`,
	};
}

interface PackageIdentity {
	/** Empty string when the name is unscoped. */
	readonly scope: string;
	readonly unscopedName: string;
}

function parsePackageIdentity(packageName: string): PackageIdentity {
	const separatorIndex = packageName.indexOf("/");
	if (!packageName.startsWith("@") || separatorIndex < 0) {
		return { scope: "", unscopedName: packageName };
	}
	return {
		scope: packageName.slice(0, separatorIndex),
		unscopedName: packageName.slice(separatorIndex + 1),
	};
}

function sortedMetadata(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): readonly PackageMetadata[] {
	return [...metadataByName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function buildManifestViolation(
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
		text: `${metadata.name} violates the package disposition ontology: ${reason}.`,
	};
}
