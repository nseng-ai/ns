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
	provenance: AregManifestSkillSourceProvenance;
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
		sourceType: source.provenance.type,
		packageName: source.provenance.packageName,
		sourceRelativePath: source.provenance.relativePath,
		version: source.provenance.version,
		targetSkillRelativePath: source.targetSkillRelativePath,
	};
}

export function groupBySkillName(
	sources: readonly AregManifestSkillSourceInspection[],
): ReadonlyMap<string, readonly AregManifestSkillSourceInspection[]> {
	const grouped = new Map<string, AregManifestSkillSourceInspection[]>();
	for (const source of sources) {
		const existing = grouped.get(source.skillName) ?? [];
		existing.push(source);
		grouped.set(source.skillName, existing);
	}
	return grouped;
}

export function manifestSourceViewsBySkillName(
	sources: readonly AregManifestSkillSourceInspection[],
): ReadonlyMap<string, readonly AregManifestSkillSourceView[]> {
	return new Map(
		[...groupBySkillName(sources)].map(([skillName, skillSources]) => [
			skillName,
			skillSources.map((source) => toManifestSkillSourceView(source)),
		]),
	);
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

export type AregManifestInspectionError =
	| { type: "manifest"; manifestPath: string; message: string }
	| { type: "harness"; harness: HarnessId; message: string };

export interface AregManifestSkillSourcesInspection {
	sources: readonly AregManifestSkillSourceInspection[];
	errors: readonly AregManifestInspectionError[];
}
