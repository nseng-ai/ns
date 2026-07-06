export const HARNESS_ARTIFACT_KINDS = ["skill", "agent", "extension-bundle"] as const;

export type HarnessArtifactKind = (typeof HARNESS_ARTIFACT_KINDS)[number];

export interface HarnessArtifactEntryBase {
	id: string;
	name: string;
	description: string;
	source: FirstPartyHarnessArtifactSource;
}

export interface SkillHarnessArtifactEntry extends HarnessArtifactEntryBase {
	kind: "skill";
	skillName: string;
}

export interface AgentHarnessArtifactEntry extends HarnessArtifactEntryBase {
	kind: "agent";
	agentName: string;
}

export interface ExtensionBundleHarnessArtifactEntry extends HarnessArtifactEntryBase {
	kind: "extension-bundle";
	bundleName: string;
}

export type HarnessArtifactEntry =
	| SkillHarnessArtifactEntry
	| AgentHarnessArtifactEntry
	| ExtensionBundleHarnessArtifactEntry;

export interface FirstPartyHarnessArtifactSource {
	type: "first-party";
	packageName: string;
	relativePath: string;
}

export interface FirstPartyHarnessArtifactCatalog {
	type: "first-party-catalog";
	catalogId: string;
	artifacts: readonly HarnessArtifactEntry[];
}

export function artifactProvisionName(artifact: HarnessArtifactEntry): string {
	switch (artifact.kind) {
		case "skill":
			return artifact.skillName;
		case "agent":
			return artifact.agentName;
		case "extension-bundle":
			return artifact.bundleName;
	}
}
