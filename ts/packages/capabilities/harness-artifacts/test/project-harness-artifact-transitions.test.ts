import { describe, expect, test } from "vitest";

import { prepareProjectHarnessArtifactTransitions } from "../src/project-harness-artifact-transitions.ts";
import type { DesiredHarnessArtifact, HarnessManifestSnapshot } from "../src/reconcile.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

describe("project harness-artifact transitions", () => {
	test.each([
		["update caller", { type: "force-capable", shouldForce: false } as const],
		["activation-equivalent caller", { type: "force-capable", shouldForce: false } as const],
	])("prepares the parity-table transition for %s", async (_caller, conflictPolicy) => {
		const fs = new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" });
		const prepared = await prepareProjectHarnessArtifactTransitions({
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"],
			manifests: manifestSnapshots(),
			pathContext: { projectRoot: "/repo" },
			trustedRepoRoot: "/repo",
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

	test("strict activation and update force are encoded only as explicit caller policy", async () => {
		const fs = new InMemoryHarnessFs({ "/module/skills/demo/SKILL.md": "demo\n" });
		const request = {
			desired: [desiredArtifact()],
			selectedHarnesses: ["pi"] as const,
			manifests: manifestSnapshots(),
			pathContext: { projectRoot: "/repo" },
			trustedRepoRoot: "/repo",
			deletionAuthority: { type: "full", preserveRemovedSources: false } as const,
			fs,
		};
		const strict = await prepareProjectHarnessArtifactTransitions({
			...request,
			conflictPolicy: { type: "strict", shouldForce: false },
		});
		const forced = await prepareProjectHarnessArtifactTransitions({
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
