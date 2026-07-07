import { z } from "zod";

import type {
	HarnessId,
	HarnessScope,
	PathState,
	TextFileState,
} from "@nseng-ai/harness-artifacts/api";

export type AregManifestSourceType = "first-party" | "npm-module";

export interface AregManifestSkillSourceProvenance {
	type: AregManifestSourceType;
	packageName: string;
	relativePath: string;
	version: string;
}

export interface AregManifestSkillSourceInspection {
	skillName: string;
	harness: HarnessId;
	scope: HarnessScope;
	manifestPath: string;
	manifestKey: string;
	source: AregManifestSkillSourceProvenance;
	targetRootRelativePath: string;
	targetSkillRelativePath: string;
	skillDir: PathState;
	skillMd: TextFileState;
}

export const aregManifestSkillSourceViewSchema = z.object({
	harness: z.string(),
	scope: z.string(),
	manifestPath: z.string(),
	manifestKey: z.string(),
	sourceType: z.enum(["first-party", "npm-module"]),
	packageName: z.string(),
	sourceRelativePath: z.string(),
	version: z.string(),
	targetSkillRelativePath: z.string(),
});

export type AregManifestSkillSourceView = z.infer<typeof aregManifestSkillSourceViewSchema>;

export function toManifestSkillSourceView(
	source: AregManifestSkillSourceInspection,
): AregManifestSkillSourceView {
	return {
		harness: source.harness,
		scope: source.scope,
		manifestPath: source.manifestPath,
		manifestKey: source.manifestKey,
		sourceType: source.source.type,
		packageName: source.source.packageName,
		sourceRelativePath: source.source.relativePath,
		version: source.source.version,
		targetSkillRelativePath: source.targetSkillRelativePath,
	};
}

export function groupBySkillName<T extends { skillName: string }>(
	sources: readonly T[],
): ReadonlyMap<string, readonly T[]> {
	const grouped = new Map<string, T[]>();
	for (const source of sources) {
		const existing = grouped.get(source.skillName) ?? [];
		existing.push(source);
		grouped.set(source.skillName, existing);
	}
	return grouped;
}

export function isSkillKindLookupPath(relativePath: string): boolean {
	return relativePath.startsWith("skills/") || relativePath.startsWith(".agents/skills/");
}

export function manifestSkillKindNames(
	sources: readonly AregManifestSkillSourceInspection[],
): readonly string[] {
	return sources
		.filter(
			(source) =>
				source.skillDir.type === "directory" &&
				source.skillMd.type === "file" &&
				isSkillKindLookupPath(source.targetSkillRelativePath),
		)
		.map((source) => source.skillName);
}

export type ManifestSkillSourceStatus = "ok" | "target-missing" | "md-missing";

export function classifyManifestSkillSource(
	source: AregManifestSkillSourceInspection,
): ManifestSkillSourceStatus {
	if (source.skillDir.type === "missing") return "target-missing";
	if (source.skillMd.type === "missing") return "md-missing";
	return "ok";
}

export interface AregManifestInspectionError {
	manifestPath: string;
	message: string;
}

export interface AregManifestSkillSourcesInspection {
	sources: readonly AregManifestSkillSourceInspection[];
	errors: readonly AregManifestInspectionError[];
}

export type ManifestSourceFinding = {
	code: "manifest-skill-target-missing" | "manifest-skill-md-missing";
	message: string;
	path: string;
	remediation: string;
};

export const MANIFEST_FAILURE_CODE = "invalid-install-manifest";
export const MANIFEST_FAILURE_REMEDIATION =
	"Fix the shared harness artifact manifest or run ns update to reconcile manifest-tracked artifacts.";
export const MANIFEST_SOURCE_REMEDIATION =
	"Run ns update to reconcile manifest-tracked harness artifacts, or remove/fix the stale manifest entry through the owning provisioning workflow.";

export function manifestSourceLabel(source: AregManifestSkillSourceInspection): string {
	return `Shared manifest entry ${source.manifestKey} from ${source.source.packageName}@${source.source.version}`;
}

export function manifestSourceFinding(
	source: AregManifestSkillSourceInspection,
): ManifestSourceFinding | undefined {
	const label = manifestSourceLabel(source);
	const status = classifyManifestSkillSource(source);
	if (status === "target-missing") {
		return {
			code: "manifest-skill-target-missing",
			path: source.targetSkillRelativePath,
			message: `${label} targets ${source.targetSkillRelativePath}, but the skill directory is missing.`,
			remediation: MANIFEST_SOURCE_REMEDIATION,
		};
	}
	if (status === "md-missing") {
		return {
			code: "manifest-skill-md-missing",
			path: `${source.targetSkillRelativePath}/SKILL.md`,
			message: `${label} targets ${source.targetSkillRelativePath}, but SKILL.md is missing.`,
			remediation: MANIFEST_SOURCE_REMEDIATION,
		};
	}
	return undefined;
}
