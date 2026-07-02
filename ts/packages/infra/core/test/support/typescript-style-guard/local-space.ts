import { BAN_LOCAL_SPACE_ADMISSION } from "./config.ts";
import { collectExtensionManifestWorkspaceEdges } from "./dependency-graph.ts";
import { lineAndColumnForOffset, type TextPosition } from "./json-diagnostics.ts";
import type { PackageMetadata } from "./package-metadata.ts";
import type { SourceRuleViolation } from "./source-rules.ts";

const LOCAL_SPACE_DIR = "ts/packages/local/";
const LOCAL_SPACE_SCOPE = "@sdl-local/";

export function collectLocalSpaceAdmissionViolations(
	metadataByName: ReadonlyMap<string, PackageMetadata>,
): SourceRuleViolation[] {
	const violations: SourceRuleViolation[] = [];
	const packageNames = new Set(metadataByName.keys());

	for (const metadata of [...metadataByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		const isLocalPath = isLocalSpacePackage(metadata);
		const isLocalName = isLocalSpaceName(metadata.name);

		if (isLocalPath && !isLocalName) {
			violations.push(
				buildLocalSpaceManifestViolation(
					metadata,
					`packages under ${LOCAL_SPACE_DIR.slice(0, -1)} must use the ${LOCAL_SPACE_SCOPE} scope`,
				),
			);
		}
		if (isLocalName && !isLocalPath) {
			violations.push(
				buildLocalSpaceManifestViolation(
					metadata,
					`${LOCAL_SPACE_SCOPE} packages must live under ${LOCAL_SPACE_DIR.slice(0, -1)}`,
				),
			);
		}
		if (isLocalName && metadata.manifest.private !== true) {
			violations.push(
				buildLocalSpaceManifestViolation(metadata, `${LOCAL_SPACE_SCOPE} packages must be private`),
			);
		}
	}

	for (const edge of collectExtensionManifestWorkspaceEdges(metadataByName, packageNames)) {
		const targetMetadata = metadataByName.get(edge.to);
		const sourceMetadata = metadataByName.get(edge.from);
		if (targetMetadata === undefined || sourceMetadata === undefined) continue;
		if (!isLocalSpaceName(targetMetadata.name)) continue;
		if (isLocalSpacePackage(sourceMetadata)) continue;
		violations.push({
			rule: BAN_LOCAL_SPACE_ADMISSION,
			path: edge.path,
			line: edge.line,
			column: edge.column,
			text: `${edge.from} must not depend on local-space package ${edge.to}; ${LOCAL_SPACE_SCOPE} packages are private repo-local Pi tools with no outside workspace dependents.`,
		});
	}

	return violations;
}

function isLocalSpaceName(packageName: string): boolean {
	return packageName.startsWith(LOCAL_SPACE_SCOPE);
}

function isLocalSpacePackage(metadata: PackageMetadata): boolean {
	return metadata.packageDir.startsWith(LOCAL_SPACE_DIR);
}

function buildLocalSpaceManifestViolation(
	metadata: PackageMetadata,
	reason: string,
): SourceRuleViolation {
	const position = findLocalSpaceManifestPosition(metadata);
	return {
		rule: BAN_LOCAL_SPACE_ADMISSION,
		path: metadata.packageJsonPath,
		line: position.line,
		column: position.column,
		text: `${metadata.name} violates local-space admission: ${reason}.`,
	};
}

function findLocalSpaceManifestPosition(metadata: PackageMetadata): TextPosition {
	const privateOffset = metadata.manifestContent.indexOf('"private"');
	if (privateOffset >= 0) return lineAndColumnForOffset(metadata.manifestContent, privateOffset);
	const nameOffset = metadata.manifestContent.indexOf(`"${metadata.name}"`);
	return lineAndColumnForOffset(metadata.manifestContent, Math.max(0, nameOffset));
}
