import { BAN_PACKAGE_DISPOSITION_TOPOLOGY, manifestDependencyFields } from "./config.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { findManifestKeyPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const PACKAGES_ROOT = "ts/packages";

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
 * Two ADR 0045 §5 rules are deliberately **not** implemented here, because the Pi extraction
 * they police is deferred past the tree cutover:
 *
 * - the `pi-ns-*` adapter rule (an adapter may import only its extension's curated API plus
 *   what disposition closure permits, never deep or private extension source);
 * - the structural rule that no ns extension carries a `pi` subpackage, a `./pi*` export, a
 *   Pi peer dependency, or Pi registration.
 *
 * Both belong in this module when the `pi-ns-*` packages actually exist. Their absence is a
 * sequencing decision, not an oversight.
 *
 * This rule overlaps `NS_TS_INTERNAL_SPACE_ADMISSION` on the internal scope/private pair and
 * on inbound edges to `@internal/*`. That overlap is intentional: the older rule states the
 * internal-space contract on its own terms, this one derives the same facts from the
 * disposition model, and neither can be relaxed without the other noticing.
 */
export function collectPackageDispositionViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
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
