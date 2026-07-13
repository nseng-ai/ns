import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";

import { RealArtifactActivationGateway } from "../../src/real-artifact-activation.ts";
import { RealArtifactProvisioningStatusGateway } from "../../src/real-artifact-provisioning-status.ts";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
	tempRoots.length = 0;
});

describe("RealArtifactProvisioningStatusGateway", () => {
	test("reports none, pending, provisioned, refreshed, and conflicted artifact instances without applying", async () => {
		const fixture = await artifactFixture();
		const gateway = new RealArtifactProvisioningStatusGateway();
		const emptyDescriptor = descriptor({
			moduleRoot: join(fixture.root, "empty-extension"),
			packageName: "@test/empty",
		});

		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [emptyDescriptor, fixture.descriptor],
				harnesses: ["pi", "codex"],
			}),
		).resolves.toMatchObject([
			{
				moduleRoot: emptyDescriptor.moduleRoot,
				artifactStatus: "none",
				artifactCount: 0,
				affectedArtifactCount: 0,
			},
			{
				moduleRoot: fixture.descriptor.moduleRoot,
				artifactStatus: "needs-reconcile",
				artifactCount: 2,
				affectedArtifactCount: 2,
			},
		]);
		await expect(
			readFile(join(fixture.repoRoot, ".pi/skills/demo/SKILL.md"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });

		const activation = new RealArtifactActivationGateway();
		const prepared = await activation.prepare({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor],
			harnesses: ["pi"],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await activation.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);

		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [fixture.descriptor],
				harnesses: ["pi"],
			}),
		).resolves.toEqual([
			{
				moduleRoot: fixture.descriptor.moduleRoot,
				artifactStatus: "provisioned",
				artifactCount: 1,
				affectedArtifactCount: 0,
				diagnostics: [],
			},
		]);

		await writeFile(join(fixture.descriptor.moduleRoot, "skills/demo/SKILL.md"), "# Demo v2\n");
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [fixture.descriptor],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([
			{ artifactStatus: "needs-reconcile", artifactCount: 1, affectedArtifactCount: 1 },
		]);

		await writeFile(join(fixture.repoRoot, ".pi/skills/demo/SKILL.md"), "# Customer edit\n");
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [fixture.descriptor],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([
			{
				artifactStatus: "conflicted",
				artifactCount: 1,
				affectedArtifactCount: 1,
				diagnostics: [
					{
						code: "artifact-local-conflict",
						path: join(fixture.repoRoot, ".pi/skills/demo/SKILL.md"),
					},
				],
			},
		]);
	});

	test("applies unavailable over conflicted over needs-reconcile over provisioned precedence", async () => {
		const fixture = await artifactFixture();
		await mkdir(join(fixture.descriptor.moduleRoot, "skills/other"), { recursive: true });
		await writeFile(join(fixture.descriptor.moduleRoot, "skills/other/SKILL.md"), "# Other\n");
		const mixedDescriptor: DeclaredExtensionDescriptor = {
			...fixture.descriptor,
			descriptor: {
				description: "mixed",
				bundledArtifacts: [
					{ kind: "skill", name: "demo", path: "skills/demo" },
					{ kind: "skill", name: "other", path: "skills/other" },
				],
			},
		};
		const activation = new RealArtifactActivationGateway();
		const prepared = await activation.prepare({
			repoRoot: fixture.repoRoot,
			descriptors: [mixedDescriptor],
			harnesses: ["pi"],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await activation.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);
		const gateway = new RealArtifactProvisioningStatusGateway();

		await writeFile(join(fixture.descriptor.moduleRoot, "skills/demo/SKILL.md"), "# Demo v2\n");
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [mixedDescriptor],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([{ artifactStatus: "needs-reconcile" }]);

		await writeFile(join(fixture.repoRoot, ".pi/skills/other/SKILL.md"), "# Customer edit\n");
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [mixedDescriptor],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([{ artifactStatus: "conflicted" }]);

		await rm(join(fixture.descriptor.moduleRoot, "skills/demo/SKILL.md"));
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [mixedDescriptor],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([
			{
				artifactStatus: "unavailable",
				diagnostics: expect.arrayContaining([
					expect.objectContaining({ code: "module-artifact-skill-entry-missing" }),
				]),
			},
		]);
	});

	test("reports discovery and whole-inspection failures as unavailable data", async () => {
		const fixture = await artifactFixture({ writeSkill: false });
		const gateway = new RealArtifactProvisioningStatusGateway();
		const discovery = await gateway.inspect({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor],
			harnesses: ["pi"],
		});
		expect(discovery).toMatchObject([
			{
				artifactStatus: "unavailable",
				artifactCount: 0,
				affectedArtifactCount: 0,
				diagnostics: [{ code: "module-artifact-skill-entry-missing" }],
			},
		]);

		await mkdir(join(fixture.repoRoot, ".pi/skills"), { recursive: true });
		const manifestPath = join(fixture.repoRoot, ".pi/skills/.ns-harness-artifacts-manifest.json");
		await writeFile(manifestPath, "not json\n");
		const failed = await gateway.inspect({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor],
			harnesses: ["pi"],
		});
		expect(failed).toEqual([
			{
				moduleRoot: fixture.descriptor.moduleRoot,
				artifactStatus: "unavailable",
				artifactCount: 0,
				affectedArtifactCount: 0,
				diagnostics: [
					{
						code: "invalid-install-manifest",
						message: expect.stringContaining("is not valid JSON"),
						path: manifestPath,
					},
				],
			},
		]);
	});

	test("reports ambiguous discovery attribution explicitly for duplicate package names", async () => {
		const fixture = await artifactFixture({ writeSkill: false });
		const healthyRoot = join(fixture.root, "healthy-extension");
		await mkdir(healthyRoot, { recursive: true });
		const healthyDescriptor = descriptor({
			moduleRoot: healthyRoot,
			packageName: fixture.descriptor.packageName,
		});

		const result = await new RealArtifactProvisioningStatusGateway().inspect({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor, healthyDescriptor],
			harnesses: ["pi"],
		});

		expect(result).toHaveLength(2);
		for (const summary of result) {
			expect(summary).toMatchObject({
				artifactStatus: "unavailable",
				diagnostics: [
					{
						code: "artifact-attribution-ambiguous",
						message: expect.stringContaining("module-artifact-skill-entry-missing"),
					},
				],
			});
		}
	});

	test("classifies skipped target collisions as conflicted for each module", async () => {
		const fixture = await artifactFixture();
		const otherRoot = join(fixture.root, "other-extension");
		await mkdir(join(otherRoot, "skills/demo"), { recursive: true });
		await writeFile(join(otherRoot, "skills/demo/SKILL.md"), "# Other demo\n");
		const otherDescriptor = descriptor({
			moduleRoot: otherRoot,
			packageName: "@test/other",
			artifactName: "demo",
		});

		const result = await new RealArtifactProvisioningStatusGateway().inspect({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor, otherDescriptor],
			harnesses: ["pi"],
		});

		expect(result).toHaveLength(2);
		for (const summary of result) {
			expect(summary).toMatchObject({
				artifactStatus: "conflicted",
				artifactCount: 1,
				affectedArtifactCount: 1,
				diagnostics: expect.arrayContaining([
					expect.objectContaining({ code: "artifact-collision" }),
				]),
			});
		}
	});

	test("counts a same-target replacement as one observed artifact instance", async () => {
		const fixture = await artifactFixture();
		const activation = new RealArtifactActivationGateway();
		const prepared = await activation.prepare({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor],
			harnesses: ["pi"],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await activation.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);
		const replacement = descriptor({
			moduleRoot: fixture.descriptor.moduleRoot,
			packageName: "@test/replacement",
			artifactName: "demo",
		});

		await expect(
			new RealArtifactProvisioningStatusGateway().inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [replacement],
				harnesses: ["pi"],
			}),
		).resolves.toEqual([
			{
				moduleRoot: replacement.moduleRoot,
				artifactStatus: "needs-reconcile",
				artifactCount: 1,
				affectedArtifactCount: 1,
				diagnostics: [],
			},
		]);
	});

	test("does not assign removal facts to one of two modules with the same package name", async () => {
		const fixture = await artifactFixture();
		const activation = new RealArtifactActivationGateway();
		const prepared = await activation.prepare({
			repoRoot: fixture.repoRoot,
			descriptors: [fixture.descriptor],
			harnesses: ["pi"],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const applied = await activation.apply(prepared.prepared);
		if (!applied.ok) throw new Error(applied.error.message);
		const gateway = new RealArtifactProvisioningStatusGateway();
		const descriptorWithoutArtifacts = descriptor({
			moduleRoot: fixture.descriptor.moduleRoot,
			packageName: "@test/demo",
		});
		await expect(
			gateway.inspect({
				repoRoot: fixture.repoRoot,
				descriptors: [descriptorWithoutArtifacts],
				harnesses: ["pi"],
			}),
		).resolves.toMatchObject([
			{ artifactStatus: "needs-reconcile", artifactCount: 1, affectedArtifactCount: 1 },
		]);

		const otherRoot = join(fixture.root, "same-package-extension");
		await mkdir(otherRoot, { recursive: true });
		const descriptors = [
			descriptorWithoutArtifacts,
			descriptor({ moduleRoot: otherRoot, packageName: "@test/demo" }),
		];

		const result = await gateway.inspect({
			repoRoot: fixture.repoRoot,
			descriptors,
			harnesses: ["pi"],
		});

		expect(result).toHaveLength(2);
		for (const summary of result) {
			expect(summary).toMatchObject({
				artifactStatus: "unavailable",
				artifactCount: 0,
				affectedArtifactCount: 0,
				diagnostics: [{ code: "artifact-attribution-ambiguous" }],
			});
		}
	});
});

async function artifactFixture(options: { writeSkill?: boolean } = {}): Promise<{
	root: string;
	repoRoot: string;
	descriptor: DeclaredExtensionDescriptor;
}> {
	const root = await mkdtemp(join(tmpdir(), "ns-init-artifact-status-"));
	tempRoots.push(root);
	const repoRoot = join(root, "repo");
	const moduleRoot = join(root, "extension");
	await mkdir(join(moduleRoot, "skills/demo"), { recursive: true });
	await mkdir(repoRoot, { recursive: true });
	if (options.writeSkill !== false) {
		await writeFile(join(moduleRoot, "skills/demo/SKILL.md"), "# Demo\n");
	}
	return {
		root,
		repoRoot,
		descriptor: descriptor({ moduleRoot, packageName: "@test/demo", artifactName: "demo" }),
	};
}

function descriptor(options: {
	moduleRoot: string;
	packageName: string;
	artifactName?: string;
}): DeclaredExtensionDescriptor {
	return {
		spec: options.moduleRoot,
		sourceKind: "local",
		moduleRoot: options.moduleRoot,
		descriptorPath: join(options.moduleRoot, "extension.ts"),
		packageName: options.packageName,
		version: "1.0.0",
		descriptor: {
			description: options.packageName,
			...(options.artifactName === undefined
				? {}
				: {
						bundledArtifacts: [
							{
								kind: "skill" as const,
								name: options.artifactName,
								path: `skills/${options.artifactName}`,
							},
						],
					}),
		},
	};
}
