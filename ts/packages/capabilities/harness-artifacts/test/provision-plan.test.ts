import { join } from "node:path";

import { describe, expect, test } from "vitest";

import type {
	AgentHarnessArtifactEntry,
	SkillHarnessArtifactEntry,
} from "../src/artifact-catalog.ts";
import {
	buildInstallManifestData,
	buildInstallManifestEntry,
	type InstallManifestEntryData,
} from "../src/provision-manifest.ts";
import {
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForText,
	installManifestKey,
	type ProvisionPlan,
	type TargetFileHashFact,
} from "../src/provision-plan.ts";

const skillArtifact = {
	kind: "skill",
	id: "objective-next-skill",
	name: "Objective next skill",
	description: "Objective workflow instructions.",
	skillName: "objective-next",
	source: {
		type: "first-party",
		packageName: "@nseng-ai/ns",
		relativePath: "skills/objective-next",
	},
} as const satisfies SkillHarnessArtifactEntry;

const npmModuleSkillArtifact = {
	kind: "skill",
	id: "@acme/ext:demo-skill",
	name: "demo-skill",
	description: "Demo skill.",
	skillName: "demo-skill",
	source: {
		type: "npm-module",
		packageName: "@acme/ext",
		relativePath: "skills/demo-skill",
	},
} as const satisfies SkillHarnessArtifactEntry;

const agentArtifact = {
	kind: "agent",
	id: "task-agent",
	name: "Task agent",
	description: "Focused task profile.",
	agentName: "task",
	source: {
		type: "first-party",
		packageName: "@nseng-ai/ns",
		relativePath: ".ns/pi/agents/task.md",
	},
} as const satisfies AgentHarnessArtifactEntry;

const context = {
	projectRoot: "/repo",
	homeDir: "/home/alice",
	env: { CLAUDE_CONFIG_DIR: "/tmp/claude-config" },
};

const sourceFiles = [
	{ relativePath: "SKILL.md", contentHash: contentHashForText("skill") },
	{ relativePath: "references/guide.md", contentHash: contentHashForText("guide") },
] as const;

function planFor(options: { harness?: string; scope?: "project" | "user" } = {}): ProvisionPlan {
	const result = buildProvisionPlan({
		artifact: skillArtifact,
		harness: options.harness ?? "pi",
		scope: options.scope ?? "project",
		context,
		sourceVersion: "git:abc123",
		sourceFiles,
	});
	expect(result).toMatchObject({ ok: true });
	if (!result.ok) throw new Error(result.error.message);
	return result.value;
}

function fileFact(file: ProvisionPlan["files"][number], contentHash: string): TargetFileHashFact {
	return { type: "file", targetPath: file.targetPath, contentHash };
}

function missingFact(file: ProvisionPlan["files"][number]): TargetFileHashFact {
	return { type: "missing", targetPath: file.targetPath };
}

function planFile(plan: ProvisionPlan, index: number): ProvisionPlan["files"][number] {
	const file = plan.files[index];
	if (file === undefined) throw new Error(`Expected provision plan file at index ${index}.`);
	return file;
}

describe("provision plan", () => {
	test.each([
		["claude-code", "project", "/repo/.claude/skills"],
		["claude-code", "user", "/tmp/claude-config/skills"],
		["codex", "project", "/repo/.agents/skills"],
		["codex", "user", "/home/alice/.agents/skills"],
		["pi", "project", "/repo/.pi/skills"],
		["pi", "user", "/home/alice/.pi/agent/skills"],
	] as const)("builds deterministic %s %s-scope copy plans", (harness, scope, targetRoot) => {
		const plan = planFor({ harness, scope });

		expect(plan).toEqual({
			artifactId: "objective-next-skill",
			kind: "skill",
			provisionName: "objective-next",
			harness,
			scope,
			targetRoot,
			targetArtifactPath: join(targetRoot, "objective-next"),
			source: {
				type: "first-party",
				packageName: "@nseng-ai/ns",
				relativePath: "skills/objective-next",
				version: "git:abc123",
			},
			files: [
				{
					relativePath: "SKILL.md",
					sourcePath: "skills/objective-next/SKILL.md",
					targetPath: join(targetRoot, "objective-next/SKILL.md"),
					contentHash: contentHashForText("skill"),
				},
				{
					relativePath: "references/guide.md",
					sourcePath: "skills/objective-next/references/guide.md",
					targetPath: join(targetRoot, "objective-next/references/guide.md"),
					contentHash: contentHashForText("guide"),
				},
			],
		});
	});

	test("records npm-module source provenance with the supplied source version", () => {
		const result = buildProvisionPlan({
			artifact: npmModuleSkillArtifact,
			harness: "pi",
			scope: "project",
			context,
			sourceVersion: "1.2.3",
			sourceFiles,
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.source).toEqual({
			type: "npm-module",
			packageName: "@acme/ext",
			relativePath: "skills/demo-skill",
			version: "1.2.3",
		});
		expect(buildInstallManifestEntry(result.value).source).toEqual(result.value.source);
	});

	test("sorts source files by relative path for stable output", () => {
		const result = buildProvisionPlan({
			artifact: skillArtifact,
			harness: "pi",
			scope: "project",
			context,
			sourceVersion: "git:abc123",
			sourceFiles: [...sourceFiles].reverse(),
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.files.map((file) => file.relativePath)).toEqual([
			"SKILL.md",
			"references/guide.md",
		]);
	});

	test("rejects model-only artifact kinds as typed results", () => {
		const result = buildProvisionPlan({
			artifact: agentArtifact,
			harness: "pi",
			scope: "project",
			context,
			sourceVersion: "git:abc123",
			sourceFiles,
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "unsupported_artifact_kind",
				details: { kind: "agent", artifactId: "task-agent" },
			},
		});
	});
});

describe("install manifest", () => {
	test("records provisioned files with content hashes and source-version provenance", () => {
		const plan = planFor();
		const entry = buildInstallManifestEntry(plan);

		expect(installManifestKey(plan)).toBe("pi:project:skill:objective-next-skill");
		expect(entry).toEqual({
			artifactId: "objective-next-skill",
			kind: "skill",
			provisionName: "objective-next",
			harness: "pi",
			scope: "project",
			targetRoot: "/repo/.pi/skills",
			targetArtifactPath: "/repo/.pi/skills/objective-next",
			source: {
				type: "first-party",
				packageName: "@nseng-ai/ns",
				relativePath: "skills/objective-next",
				version: "git:abc123",
			},
			files: {
				"SKILL.md": {
					sourcePath: "skills/objective-next/SKILL.md",
					targetPath: "/repo/.pi/skills/objective-next/SKILL.md",
					contentHash: contentHashForText("skill"),
				},
				"references/guide.md": {
					sourcePath: "skills/objective-next/references/guide.md",
					targetPath: "/repo/.pi/skills/objective-next/references/guide.md",
					contentHash: contentHashForText("guide"),
				},
			},
		});
		expect(buildInstallManifestData([entry])).toEqual({
			version: 1,
			artifacts: { "pi:project:skill:objective-next-skill": entry },
		});
	});
});

describe("manifest-driven refuse-to-clobber decisions", () => {
	test("classifies missing targets as fresh writes", () => {
		const plan = planFor();
		const result = classifyProvisionDecisions({
			plan,
			targetFacts: plan.files.map(missingFact),
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.isForceRequired).toBe(false);
		expect(result.value.files.map((decision) => decision.type)).toEqual([
			"fresh-write",
			"fresh-write",
		]);
	});

	test("classifies matching target hashes as unchanged", () => {
		const plan = planFor();
		const result = classifyProvisionDecisions({
			plan,
			targetFacts: plan.files.map((file) => fileFact(file, file.contentHash)),
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.isForceRequired).toBe(false);
		expect(result.value.files.map((decision) => decision.type)).toEqual(["unchanged", "unchanged"]);
	});

	test("allows fresh writes over files unchanged since the previous manifest", () => {
		const oldPlan = planFor();
		const oldEntry = buildInstallManifestEntry(oldPlan);
		const newPlan = {
			...oldPlan,
			files: oldPlan.files.map((file) => ({
				...file,
				contentHash: `${file.contentHash.slice(0, 63)}0`,
			})),
		} satisfies ProvisionPlan;
		const result = classifyProvisionDecisions({
			plan: newPlan,
			existingManifestEntry: oldEntry,
			targetFacts: oldPlan.files.map((file) => fileFact(file, file.contentHash)),
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.isForceRequired).toBe(false);
		expect(result.value.files.map((decision) => decision.type)).toEqual([
			"fresh-write",
			"fresh-write",
		]);
	});

	test("classifies unmanaged or locally edited targets as force-required conflicts", () => {
		const plan = planFor();
		const manifest = buildInstallManifestEntry(plan);
		const editedHash = contentHashForText("local edit");
		const result = classifyProvisionDecisions({
			plan,
			existingManifestEntry: manifest,
			targetFacts: [fileFact(planFile(plan, 0), editedHash), missingFact(planFile(plan, 1))],
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.isForceRequired).toBe(true);
		expect(result.value.files.map((decision) => decision.type)).toEqual([
			"locally-edited-conflict",
			"fresh-write",
		]);
	});

	test("requires explicit hash facts for every planned target", () => {
		const plan = planFor();
		const result = classifyProvisionDecisions({
			plan,
			targetFacts: [missingFact(planFile(plan, 0))],
		});

		expect(result).toMatchObject({
			ok: false,
			error: {
				code: "target_hash_fact_missing",
				details: { targetPath: planFile(plan, 1).targetPath },
			},
		});
	});

	test("rejects a manifest entry for a different install key", () => {
		const plan = planFor();
		const mismatchedEntry: InstallManifestEntryData = {
			...buildInstallManifestEntry(plan),
			harness: "codex",
		};
		const result = classifyProvisionDecisions({
			plan,
			existingManifestEntry: mismatchedEntry,
			targetFacts: plan.files.map(missingFact),
		});

		expect(result).toMatchObject({ ok: false, error: { code: "manifest_entry_mismatch" } });
	});
});
