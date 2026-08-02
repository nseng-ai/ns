import { describe, expect, test } from "vitest";

import {
	appliedHarnessArtifactTransitionFileEffects,
	applyHarnessArtifactTransitions,
	prepareHarnessArtifactTransitions,
	readHarnessManifestSnapshots,
} from "../src/harness-artifacts/harness-artifact-transitions.ts";
import { contentHashForText } from "../src/harness-artifacts/provision-plan.ts";
import type {
	DesiredHarnessArtifact,
	HarnessManifestSnapshot,
} from "../src/harness-artifacts/reconcile.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

describe("project harness-artifact transitions", () => {
	test.each([
		["update caller", { type: "force-capable", shouldForce: false } as const],
		["activation-equivalent caller", { type: "force-capable", shouldForce: false } as const],
	])("prepares the parity-table transition for %s", async (_caller, conflictPolicy) => {
		const fs = new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" });
		const prepared = await prepareHarnessArtifactTransitions({
			scope: "project",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: manifestSnapshots(),
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "full", preserveRemovedSources: false },
			conflictPolicy,
			fs,
		});

		expect(prepared).toMatchObject({
			ok: true,
			value: {
				items: [
					{
						type: "provision",
						key: "pi:project:skill:@acme/ext:demo",
						action: "installed",
						isIncludedInApply: true,
						conflictingFiles: [],
					},
				],
				transitions: [{ type: "provision", key: "pi:project:skill:@acme/ext:demo" }],
				skippedDesired: [],
				skippedCollisions: [],
				orphans: [],
				conflictPolicy,
			},
		});
	});

	test("strict conflicts short-circuit without outcomes or filesystem mutations", async () => {
		const targetPath = "/repo/.pi/skills/demo/SKILL.md";
		const fs = new InMemoryHarnessFs({
			"/module/skills/demo/SKILL.md": "demo\n",
			[targetPath]: "local edit\n",
		});
		const prepared = await prepareHarnessArtifactTransitions({
			scope: "project",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: manifestSnapshots(),
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "full", preserveRemovedSources: false },
			conflictPolicy: { type: "strict", shouldForce: false },
			fs,
		});
		expect(prepared).toMatchObject({
			ok: true,
			value: { items: [{ type: "provision", conflictingFiles: [targetPath] }] },
		});
		if (!prepared.ok) return;

		const applied = await applyHarnessArtifactTransitions(prepared.value);

		expect(applied).toEqual({ ok: true, value: { outcomes: new Map() } });
		expect(fs.readText(targetPath)).toBe("local edit\n");
		expect(fs.writtenFiles).toEqual([]);
		expect(fs.removedFiles).toEqual([]);
		expect(fs.removedDirectories).toEqual([]);
	});

	test("preserves empty manifests in the shared project snapshot", async () => {
		const snapshots = await readHarnessManifestSnapshots({
			scope: "project",
			pathContext: { projectRoot: "/repo" },
			fs: new InMemoryHarnessFs({}),
		});

		expect(snapshots).toMatchObject({
			ok: true,
			value: [
				{ harness: "claude-code", manifest: { artifacts: {} } },
				{ harness: "codex", manifest: { artifacts: {} } },
				{ harness: "pi", manifest: { artifacts: {} } },
			],
		});
	});

	test("reads all canonical user manifests with harness-specific roots", async () => {
		const snapshots = await readHarnessManifestSnapshots({
			scope: "user",
			pathContext: {
				projectRoot: "/repo",
				homeDir: "/home/dev",
				env: { CLAUDE_CONFIG_DIR: "  " },
			},
			fs: new InMemoryHarnessFs({}),
		});

		expect(snapshots).toMatchObject({
			ok: true,
			value: [
				{ harness: "claude-code", targetRoot: "/home/dev/.claude/skills" },
				{ harness: "codex", targetRoot: "/home/dev/.agents/skills" },
				{ harness: "pi", targetRoot: "/home/dev/.pi/agent/skills" },
			],
		});
	});

	test("prepares user-scope provisioning under the trusted home boundary", async () => {
		const fs = new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" });
		const prepared = await prepareHarnessArtifactTransitions({
			scope: "user",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: [],
			pathContext: { projectRoot: "/repo", homeDir: "/home/dev" },
			deletionAuthority: { type: "full", preserveRemovedSources: false },
			conflictPolicy: { type: "strict", shouldForce: false },
			fs,
		});

		expect(prepared).toMatchObject({
			ok: true,
			value: {
				items: [
					{
						key: "pi:user:skill:@acme/ext:demo",
						provision: {
							trustedBoundaryRoot: "/home/dev",
							plan: { scope: "user", targetRoot: "/home/dev/.pi/agent/skills" },
						},
					},
				],
			},
		});
	});

	test.each([
		"cross-scope",
		"wrong-root",
		"wrong-harness",
		"malformed-key",
		"escaping-path",
		"ambiguous-ownership",
	] as const)("blocks mutation for %s manifest records", async (unsafeKind) => {
		const fs = new InMemoryHarnessFs({
			"/module/skills/demo/SKILL.md": "demo\n",
			"/repo/.pi/skills/old/SKILL.md": "old\n",
		});

		const prepared = await prepareHarnessArtifactTransitions({
			scope: "project",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: [unsafeManifestSnapshot(unsafeKind)],
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "targeted", packageNames: ["@acme/ext"] },
			conflictPolicy: { type: "strict", shouldForce: false },
			fs,
		});

		expect(prepared).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		expect(fs.writtenFiles).toEqual([]);
		expect(fs.removedFiles).toEqual([]);
		expect(fs.removedDirectories).toEqual([]);
	});

	test("targeted Package A cannot replace Package B ownership when artifact ids are equal", async () => {
		const fs = new InMemoryHarnessFs({
			"/module/skills/demo/SKILL.md": "new demo\n",
			"/repo/.pi/skills/demo/SKILL.md": "old demo\n",
		});
		const ownedByOther = manifestEntryForDesired(desiredArtifact(), "@other/ext", "old demo\n");
		const prepared = await prepareHarnessArtifactTransitions({
			scope: "project",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: [manifestSnapshotWithEntry(ownedByOther)],
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "targeted", packageNames: ["@acme/ext"] },
			conflictPolicy: { type: "strict", shouldForce: false },
			fs,
		});

		expect(prepared).toMatchObject({
			ok: true,
			value: {
				items: [{ type: "provision", action: "conflicted", isIncludedInApply: false }],
				transitions: [],
			},
		});
		if (!prepared.ok) return;
		await applyHarnessArtifactTransitions(prepared.value);
		expect(fs.readText("/repo/.pi/skills/demo/SKILL.md")).toBe("old demo\n");
		expect(fs.writtenFiles).toEqual([]);
		expect(fs.removedFiles).toEqual([]);
	});

	test("validates unrelated records during strict targeted preparation", async () => {
		const snapshot = staleManifestSnapshot();
		const entry = snapshot.manifest.artifacts["pi:project:skill:@gone/ext:old"];
		if (entry === undefined) throw new Error("Expected fixture manifest entry.");
		const unrelatedMalformed = {
			...snapshot,
			manifest: {
				...snapshot.manifest,
				artifacts: { "malformed-unrelated-key": entry },
			},
		};

		const prepared = await prepareHarnessArtifactTransitions({
			scope: "project",
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: [unrelatedMalformed],
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "targeted", packageNames: ["@acme/ext"] },
			conflictPolicy: { type: "strict", shouldForce: false },
			fs: new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" }),
		});

		expect(prepared).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
	});

	test("rejects duplicate transition identities before preparation", async () => {
		const snapshot = staleManifestSnapshot();

		await expect(
			prepareHarnessArtifactTransitions({
				scope: "project",
				desired: [],
				selectedHarnesses: [],
				manifests: [snapshot, structuredClone(snapshot)],
				pathContext: { projectRoot: "/repo" },
				deletionAuthority: { type: "full", preserveRemovedSources: false },
				conflictPolicy: { type: "strict", shouldForce: false },
				fs: new InMemoryHarnessFs({ "/repo/.pi/skills/old/SKILL.md": "old\n" }),
			}),
		).rejects.toThrow("Duplicate prepared harness artifact transition key");
	});

	test("projects applied effects by key and rejects missing correlation", () => {
		const outcomes = new Map([
			["old", { type: "remove" as const, removedFiles: ["/repo/.pi/skills/old/SKILL.md"] }],
		]);

		expect(appliedHarnessArtifactTransitionFileEffects(outcomes, "old")).toEqual({
			writtenFiles: [],
			removedFiles: ["/repo/.pi/skills/old/SKILL.md"],
			conflictingFiles: [],
		});
		expect(() => appliedHarnessArtifactTransitionFileEffects(outcomes, "missing")).toThrow(
			"Applied harness artifact outcome is missing for missing",
		);
	});

	test("strict activation and update force are encoded only as explicit caller policy", async () => {
		const fs = new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" });
		const request = {
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"] as const,
			manifests: manifestSnapshots(),
			pathContext: { projectRoot: "/repo" },
			deletionAuthority: { type: "full", preserveRemovedSources: false } as const,
			fs,
		};
		const strict = await prepareHarnessArtifactTransitions({
			scope: "project",
			...request,
			conflictPolicy: { type: "strict", shouldForce: false },
		});
		const forced = await prepareHarnessArtifactTransitions({
			scope: "project",
			...request,
			conflictPolicy: { type: "force-capable", shouldForce: true },
		});
		if (!strict.ok || !forced.ok) return;

		expect({ ...strict.value, conflictPolicy: undefined }).toEqual({
			...forced.value,
			conflictPolicy: undefined,
		});
		expect(strict.value.conflictPolicy).toEqual({ type: "strict", shouldForce: false });
		expect(forced.value.conflictPolicy).toEqual({ type: "force-capable", shouldForce: true });
	});
});

function desiredArtifact(): DesiredHarnessArtifact {
	return {
		artifact: {
			id: "@acme/ext:demo",
			kind: "skill",
			name: "demo",
			description: "Demo skill",
			skillName: "demo",
			source: {
				type: "npm-module",
				packageName: "@acme/ext",
				relativePath: "skills/demo",
			},
		},
		sourceRoot: "/module",
		sourceVersion: "1.0.0",
	};
}

function manifestEntryForDesired(
	desired: DesiredHarnessArtifact,
	packageName: string,
	content: string,
) {
	return {
		artifactId: desired.artifact.id,
		kind: "skill" as const,
		provisionName: desired.artifact.skillName,
		harness: "pi" as const,
		scope: "project" as const,
		targetRoot: "/repo/.pi/skills",
		targetArtifactPath: `/repo/.pi/skills/${desired.artifact.skillName}`,
		source: { ...desired.artifact.source, packageName, version: "1.0.0" },
		files: {
			"SKILL.md": {
				sourcePath: `${desired.artifact.source.relativePath}/SKILL.md`,
				targetPath: `/repo/.pi/skills/${desired.artifact.skillName}/SKILL.md`,
				contentHash: contentHashForText(content),
			},
		},
	};
}

function manifestSnapshotWithEntry(
	entry: ReturnType<typeof manifestEntryForDesired>,
): HarnessManifestSnapshot {
	return {
		harness: "pi",
		targetRoot: "/repo/.pi/skills",
		manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
		manifest: {
			version: 1,
			artifacts: { [`pi:project:skill:${entry.artifactId}`]: entry },
		},
	};
}

function staleManifestSnapshot(): HarnessManifestSnapshot {
	return {
		harness: "pi",
		targetRoot: "/repo/.pi/skills",
		manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
		manifest: {
			version: 1,
			artifacts: {
				"pi:project:skill:@gone/ext:old": {
					artifactId: "@gone/ext:old",
					kind: "skill",
					provisionName: "old",
					harness: "pi",
					scope: "project",
					targetRoot: "/repo/.pi/skills",
					targetArtifactPath: "/repo/.pi/skills/old",
					source: {
						type: "npm-module",
						packageName: "@gone/ext",
						relativePath: "skills/old",
						version: "1.0.0",
					},
					files: {
						"SKILL.md": {
							sourcePath: "skills/old/SKILL.md",
							targetPath: "/repo/.pi/skills/old/SKILL.md",
							contentHash: contentHashForText("old\n"),
						},
					},
				},
			},
		},
	};
}

function unsafeManifestSnapshot(
	kind:
		| "cross-scope"
		| "wrong-root"
		| "wrong-harness"
		| "malformed-key"
		| "escaping-path"
		| "ambiguous-ownership",
): HarnessManifestSnapshot {
	const snapshot = staleManifestSnapshot();
	const key = "pi:project:skill:@gone/ext:old";
	const entry = snapshot.manifest.artifacts[key];
	if (entry === undefined) throw new Error("Expected fixture manifest entry.");
	if (kind === "ambiguous-ownership") {
		const other = {
			...entry,
			artifactId: "@other/ext:old",
			source: { ...entry.source, packageName: "@other/ext" },
		};
		return {
			...snapshot,
			manifest: {
				...snapshot.manifest,
				artifacts: { [key]: entry, "pi:project:skill:@other/ext:old": other },
			},
		};
	}
	const unsafeEntry =
		kind === "cross-scope"
			? { ...entry, scope: "user" as const }
			: kind === "wrong-root"
				? { ...entry, targetRoot: "/other/.pi/skills" }
				: kind === "wrong-harness"
					? { ...entry, harness: "codex" as const }
					: kind === "escaping-path"
						? {
								...entry,
								files: {
									"../escape": {
										sourcePath: "skills/escape",
										targetPath: "/repo/.pi/skills/escape",
										contentHash: "old-hash",
									},
								},
							}
						: entry;
	const unsafeKey = kind === "malformed-key" ? "not-an-install-key" : key;
	return {
		...snapshot,
		manifest: { ...snapshot.manifest, artifacts: { [unsafeKey]: unsafeEntry } },
	};
}

function manifestSnapshots(): readonly HarnessManifestSnapshot[] {
	return [
		{
			harness: "pi",
			targetRoot: "/repo/.pi/skills",
			manifestPath: "/repo/.pi/skills/.ns-harness-artifacts-manifest.json",
			manifest: { version: 1, artifacts: {} },
		},
	];
}
