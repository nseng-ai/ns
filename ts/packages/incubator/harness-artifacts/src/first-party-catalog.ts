import {
	artifactProvisionName,
	type FirstPartyHarnessArtifactCatalog,
	type SkillHarnessArtifactEntry,
} from "./artifact-catalog.ts";

export const NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG = {
	type: "first-party-catalog",
	catalogId: "ns-first-party",
	artifacts: [
		{
			kind: "skill",
			id: "objective-skill",
			name: "Objective skill",
			description: "Objective workflow grounding for ns Objective records.",
			skillName: "objective",
			source: {
				type: "first-party",
				packageName: "@nseng-ai/ns",
				relativePath: "skills/objective",
			},
		},
	],
} as const satisfies FirstPartyHarnessArtifactCatalog;

export type FirstPartySkillHarnessArtifact = Extract<
	(typeof NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG)["artifacts"][number],
	SkillHarnessArtifactEntry
>;

export function listFirstPartySkillArtifacts(): readonly FirstPartySkillHarnessArtifact[] {
	return NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG.artifacts.filter(
		(artifact) => artifact.kind === "skill",
	);
}

export function findFirstPartySkillArtifact(
	skill: string,
): FirstPartySkillHarnessArtifact | undefined {
	const normalized = skill.trim();
	return listFirstPartySkillArtifacts().find(
		(artifact) => artifact.id === normalized || artifactProvisionName(artifact) === normalized,
	);
}
