import { describe, expect, test } from "vitest";

import type { SkillHarnessArtifactEntry } from "../src/artifact-catalog.ts";
import {
	planHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type HarnessManifestSnapshot,
} from "../src/reconcile.ts";
import {
	buildInstallManifestData,
	type InstallManifestEntryData,
} from "../src/provision-manifest.ts";
import { PLANNED_HARNESS_ARTIFACT_REMOVAL_REASONS } from "../src/provision-removal.ts";

const firstPartyObjective = artifact({
	id: "objective-skill",
	skillName: "objective",
	packageName: "@nseng-ai/ns",
	sourceType: "first-party",
	relativePath: "skills/objective",
});
const modulePlan = artifact({
	id: "@acme/plans:plan-skill",
	skillName: "plan",
	packageName: "@acme/plans",
	sourceType: "npm-module",
	relativePath: "skills/plan",
});

function desired(artifactEntry: SkillHarnessArtifactEntry): DesiredHarnessArtifact {
	return {
		artifact: artifactEntry,
		sourceRoot:
			artifactEntry.source.type === "first-party"
				? "/src/ns"
				: `/repo/.ns/extensions/${artifactEntry.source.packageName}`,
		sourceVersion: artifactEntry.source.type === "first-party" ? "git:test" : "1.0.0",
	};
}

describe("harness artifact reconcile planner", () => {
	test("exposes planned removal reasons in reconcile order", () => {
		expect(PLANNED_HARNESS_ARTIFACT_REMOVAL_REASONS).toEqual([
			"removed-source",
			"deselected-harness",
			"same-target-replacement",
		]);
	});

	test("generates declared selection pairs in deterministic order", () => {
		const result = planHarnessArtifactReconcile({
			desired: [desired(modulePlan), desired(firstPartyObjective)],
			harnessSelection: ["pi", "codex"],
			manifests: [],
		});

		expect(result.orphans).toEqual([]);
		expect(result.skippedCollisions).toEqual([]);
		expect(result.pairs.map((pair) => pair.key)).toEqual([
			"codex:project:skill:@acme/plans:plan-skill",
			"codex:project:skill:objective-skill",
			"pi:project:skill:@acme/plans:plan-skill",
			"pi:project:skill:objective-skill",
		]);
		expect(result.pairs.map((pair) => pair.origin)).toEqual([
			"declared",
			"declared",
			"declared",
			"declared",
		]);
	});

	test("without a harness selection it creates no declared pairs", () => {
		const result = planHarnessArtifactReconcile({
			desired: [desired(firstPartyObjective), desired(modulePlan)],
			harnessSelection: undefined,
			manifests: [],
		});

		expect(result).toEqual({
			pairs: [],
			removals: [],
			orphans: [],
			skippedDesired: [],
			skippedCollisions: [],
		});
	});

	test("manifest-tracked pairs survive without a harness selection", () => {
		const result = planHarnessArtifactReconcile({
			desired: [desired(modulePlan)],
			harnessSelection: undefined,
			manifests: [manifestSnapshot(manifestEntry(modulePlan, "pi"))],
		});

		expect(result.pairs).toMatchObject([
			{
				key: "pi:project:skill:@acme/plans:plan-skill",
				origin: "manifest",
				hasManifestEntry: true,
			},
		]);
		expect(result.orphans).toEqual([]);
	});

	test("dedupes declared and manifest entries by install key", () => {
		const result = planHarnessArtifactReconcile({
			desired: [desired(modulePlan)],
			harnessSelection: ["pi"],
			manifests: [manifestSnapshot(manifestEntry(modulePlan, "pi"))],
		});

		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0]).toMatchObject({
			key: "pi:project:skill:@acme/plans:plan-skill",
			origin: "declared",
			hasManifestEntry: true,
		});
	});

	test("reports an orphan when the manifest packageName vanished", () => {
		const vanished = artifact({
			id: "@gone/ext:old-skill",
			skillName: "old",
			packageName: "@gone/ext",
			sourceType: "npm-module",
			relativePath: "skills/old",
		});
		const result = planHarnessArtifactReconcile({
			desired: [desired(modulePlan)],
			harnessSelection: undefined,
			manifests: [manifestSnapshot(manifestEntry(vanished, "pi"))],
		});

		expect(result).toEqual({
			pairs: [],
			removals: [],
			orphans: [
				{
					artifactId: "@gone/ext:old-skill",
					harness: "pi",
					scope: "project",
					targetRoot: "/repo/.pi/skills",
					packageName: "@gone/ext",
					sourceType: "npm-module",
				},
			],
			skippedDesired: [],
			skippedCollisions: [],
		});
	});

	test("makes full versus targeted deletion authority explicit and preserves failed full discovery", () => {
		const vanished = artifact({
			id: "@gone/ext:old-skill",
			skillName: "old",
			packageName: "@gone/ext",
			sourceType: "npm-module",
			relativePath: "skills/old",
		});
		const manifests = [manifestSnapshot(manifestEntry(vanished, "pi"))];

		const full = planHarnessArtifactReconcile({
			desired: [desired(modulePlan)],
			harnessSelection: ["pi"],
			manifests,
			deletionAuthority: { type: "full", preserveRemovedSources: false },
		});
		expect(full.removals).toMatchObject([
			{ reason: "removed-source", entry: { artifactId: "@gone/ext:old-skill" } },
		]);

		const targeted = planHarnessArtifactReconcile({
			desired: [desired(modulePlan)],
			harnessSelection: ["pi"],
			manifests,
			deletionAuthority: { type: "targeted", packageNames: ["@acme/plans"] },
		});
		expect(targeted.removals).toEqual([]);
		expect(targeted.orphans).toHaveLength(1);

		const failed = planHarnessArtifactReconcile({
			desired: [],
			harnessSelection: ["pi"],
			manifests,
			deletionAuthority: { type: "full", preserveRemovedSources: true },
		});
		expect(failed.removals).toEqual([]);
		expect(failed.orphans).toHaveLength(1);
	});

	test("reports module-vs-first-party target skillName and cross-module id collisions", () => {
		const moduleObjective = artifact({
			id: "@acme/objective:objective-skill",
			skillName: "objective",
			packageName: "@acme/objective",
			sourceType: "npm-module",
			relativePath: "skills/objective",
		});
		const duplicateIdLeft = artifact({
			id: "shared-id",
			skillName: "left",
			packageName: "@acme/left",
			sourceType: "npm-module",
			relativePath: "skills/left",
		});
		const duplicateIdRight = artifact({
			id: "shared-id",
			skillName: "right",
			packageName: "@acme/right",
			sourceType: "npm-module",
			relativePath: "skills/right",
		});

		const result = planHarnessArtifactReconcile({
			desired: [
				desired(firstPartyObjective),
				desired(moduleObjective),
				desired(duplicateIdLeft),
				desired(duplicateIdRight),
			],
			harnessSelection: ["pi"],
			manifests: [],
		});

		expect(result).toEqual({
			pairs: [],
			removals: [],
			orphans: [],
			skippedDesired: [
				desired(firstPartyObjective),
				desired(moduleObjective),
				desired(duplicateIdLeft),
				desired(duplicateIdRight),
			],
			skippedCollisions: [
				{ kind: "id", value: "shared-id", packages: ["@acme/left", "@acme/right"] },
				{
					kind: "target-name",
					value: "objective",
					packages: ["@acme/objective", "@nseng-ai/ns"],
				},
			],
		});
	});
});

function artifact(input: {
	id: string;
	skillName: string;
	packageName: string;
	sourceType: "first-party" | "npm-module";
	relativePath: string;
}): SkillHarnessArtifactEntry {
	return {
		kind: "skill",
		id: input.id,
		name: input.skillName,
		description: `${input.skillName} skill`,
		skillName: input.skillName,
		source: {
			type: input.sourceType,
			packageName: input.packageName,
			relativePath: input.relativePath,
		},
	};
}

function manifestSnapshot(entry: InstallManifestEntryData): HarnessManifestSnapshot {
	return {
		harness: entry.harness,
		targetRoot: entry.targetRoot,
		manifestPath: `${entry.targetRoot}/.ns-harness-artifacts-manifest.json`,
		manifest: buildInstallManifestData([entry]),
	};
}

function manifestEntry(
	artifactEntry: SkillHarnessArtifactEntry,
	harness: "codex" | "pi",
): InstallManifestEntryData {
	const targetRoot = harness === "pi" ? "/repo/.pi/skills" : "/repo/.agents/skills";
	const targetArtifactPath = `${targetRoot}/${artifactEntry.skillName}`;
	return {
		artifactId: artifactEntry.id,
		kind: "skill",
		provisionName: artifactEntry.skillName,
		harness,
		scope: "project",
		targetRoot,
		targetArtifactPath,
		source: { ...artifactEntry.source, version: "1.0.0" },
		files: {
			"SKILL.md": {
				sourcePath: `${artifactEntry.source.relativePath}/SKILL.md`,
				targetPath: `${targetArtifactPath}/SKILL.md`,
				contentHash: "old-hash",
			},
		},
	};
}
