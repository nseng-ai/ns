import { BAN_INTERNAL_SPACE_ADMISSION } from "./config.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const INTERNAL_SPACE_DIR = "ts/packages/internal/";
const INTERNAL_SPACE_SCOPE = "@internal/";

export function collectInternalSpaceAdmissionViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const packageNames = new Set(metadataByName.keys());

	for (const metadata of [...metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		const isInternalPath = isInternalSpacePackage(metadata);
		const isInternalName = isInternalSpaceName(metadata.name);

		if (isInternalPath && !isInternalName) {
			violations.push(
				buildInternalSpaceManifestViolation(
					metadata,
					`packages under ${INTERNAL_SPACE_DIR.slice(0, -1)} must use the ${INTERNAL_SPACE_SCOPE} scope`,
				),
			);
		}
		if (isInternalName && !isInternalPath) {
			violations.push(
				buildInternalSpaceManifestViolation(
					metadata,
					`${INTERNAL_SPACE_SCOPE} packages must live under ${INTERNAL_SPACE_DIR.slice(0, -1)}`,
				),
			);
		}
		if (isInternalName && metadata.manifest.private !== true) {
			violations.push(
				buildInternalSpaceManifestViolation(
					metadata,
					`${INTERNAL_SPACE_SCOPE} packages must be private`,
				),
			);
		}
	}

	for (const edge of collectExtensionManifestWorkspaceEdges(metadataByName, packageNames)) {
		const targetMetadata = metadataByName.get(edge.to);
		const sourceMetadata = metadataByName.get(edge.from);
		if (targetMetadata === undefined || sourceMetadata === undefined) continue;
		if (!isInternalSpaceName(targetMetadata.name)) continue;
		if (isInternalSpacePackage(sourceMetadata)) continue;
		violations.push({
			rule: BAN_INTERNAL_SPACE_ADMISSION,
			path: edge.path,
			line: edge.line,
			column: edge.column,
			text: `${edge.from} must not depend on internal-space package ${edge.to}; ${INTERNAL_SPACE_SCOPE} packages are private repo-local Pi tools with no outside workspace dependents.`,
		});
	}

	return violations;
}

function isInternalSpaceName(packageName: string): boolean {
	return packageName.startsWith(INTERNAL_SPACE_SCOPE);
}

function isInternalSpacePackage(metadata: PackageMetadata): boolean {
	return metadata.packageDir.startsWith(INTERNAL_SPACE_DIR);
}

function buildInternalSpaceManifestViolation(
	metadata: PackageMetadata,
	reason: string,
): SourceRuleViolation {
	const position = findInternalSpaceManifestPosition(metadata);
	return {
		rule: BAN_INTERNAL_SPACE_ADMISSION,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} violates internal-space admission: ${reason}.`,
	};
}

function findInternalSpaceManifestPosition(metadata: PackageMetadata): TextPosition {
	const privateOffset = metadata.manifestContent.indexOf('"private"');
	if (privateOffset >= 0) return lineAndColumnForOffset(metadata.manifestContent, privateOffset);
	const nameOffset = metadata.manifestContent.indexOf(`"${metadata.name}"`);
	return lineAndColumnForOffset(metadata.manifestContent, Math.max(0, nameOffset));
}
