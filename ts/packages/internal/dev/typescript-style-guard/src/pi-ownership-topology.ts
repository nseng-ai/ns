import { BAN_PACKAGE_DISPOSITION_TOPOLOGY, manifestDependencyFields } from "./config.ts";
import { findManifestKeyPosition } from "./json-diagnostics.ts";
import { isRecord, type PackageMetadata } from "./package-metadata.ts";
import type { PackageTopologyFact } from "./package-disposition.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const PI_ADAPTER_PREFIX = "@nseng-ai/pi-ns-";
const PI_ADAPTER_LEAF_PREFIX = "pi-ns-";
const PI_EXTENSION_OWNER_PATH = "hosts/pi/extensions";
const PI_RUNTIME_PACKAGE = "@nseng-ai/pi-runtime";
const PI_SDK_PACKAGE_PREFIX = "@earendil-works/pi-";

export interface PiOwnershipTopologyOptions {
	readonly metadataByName: ReadonlyMap<string, PackageMetadata>;
	readonly factByPackage: ReadonlyMap<string, PackageTopologyFact>;
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

function isPiOwnedSubpackage(subpackage: string): boolean {
	return subpackage === "pi" || subpackage.startsWith("pi/");
}

function isPiHostPackage(packageName: string): boolean {
	return packageName === PI_RUNTIME_PACKAGE || packageName.startsWith(PI_SDK_PACKAGE_PREFIX);
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
