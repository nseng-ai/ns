import {
	classifyManifestSkillSource,
	type AregManifestSkillSourceInspection,
} from "./manifest-sources.ts";

export interface ManifestSourceFinding {
	code: "manifest-skill-target-missing" | "manifest-skill-md-missing";
	message: string;
	path: string;
	remediation: string;
}

export const MANIFEST_FAILURE_CODE = "invalid-install-manifest";
export const MANIFEST_FAILURE_REMEDIATION =
	"Fix the shared harness artifact manifest or run ns update to reconcile manifest-tracked artifacts.";
export const MANIFEST_SOURCE_REMEDIATION =
	"Run ns update to reconcile manifest-tracked harness artifacts, or remove/fix the stale manifest entry through the owning provisioning workflow.";

export function manifestSourceLabel(source: AregManifestSkillSourceInspection): string {
	return `Shared manifest entry ${source.manifestKey} from ${source.provenance.packageName}@${source.provenance.version}`;
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
