import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

import { prepareNsActivation } from "../../src/activate-ns.ts";
import { RealArtifactActivationGateway } from "../../src/real-artifact-activation.ts";
import {
	InMemoryActivationFilesGateway,
	InMemoryDeclaredExtensionsGateway,
} from "../../src/testing/index.ts";

const tempRoots: string[] = [];

afterEach(async () => {
	await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
	tempRoots.length = 0;
});

describe("RealArtifactActivationGateway", () => {
	test("prepares and applies only declared extension artifacts", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-init-artifacts-"));
		tempRoots.push(root);
		const repoRoot = join(root, "repo");
		const moduleRoot = join(root, "extension");
		await mkdir(join(moduleRoot, "skills/demo"), { recursive: true });
		await mkdir(repoRoot, { recursive: true });
		await writeFile(join(moduleRoot, "skills/demo/SKILL.md"), "# Demo\n", "utf8");
		const record: DeclaredExtensionDescriptor = {
			spec: "../extension",
			sourceKind: "local",
			moduleRoot,
			descriptorPath: join(moduleRoot, "extension.ts"),
			packageName: "@test/demo",
			version: "1.0.0",
			descriptor: {
				description: "demo",
				bundledArtifacts: [{ kind: "skill", name: "demo", path: "skills/demo" }],
			},
		};
		const gateway = new RealArtifactActivationGateway();
		const prepared = await gateway.prepare({ repoRoot, descriptors: [record], harnesses: ["pi"] });
		expect(prepared.ok).toBe(true);
		if (!prepared.ok) return;
		const applied = await gateway.apply(prepared.prepared);
		expect(applied).toMatchObject({
			ok: true,
			completed: [{ artifactId: "@test/demo:demo", harness: "pi" }],
		});
		expect(await readFile(join(repoRoot, ".pi/skills/demo/SKILL.md"), "utf8")).toBe("# Demo\n");
	});

	test("reports removed-source cleanup and makes the cleanup rerun idempotent", async () => {
		const { gateway, repoRoot, record } = await installedArtifact(["pi"]);
		const removal = await gateway.prepare({ repoRoot, descriptors: [], harnesses: ["pi"] });
		expect(removal.ok).toBe(true);
		if (!removal.ok) return;
		const applied = await gateway.apply(removal.prepared);
		if (!applied.ok) throw new Error(JSON.stringify(applied.error));
		expect(applied).toMatchObject({
			ok: true,
			completed: [
				{
					action: "removed",
					artifactId: "@test/demo:demo",
					removalReason: "removed-source",
					removedFiles: [expect.stringContaining("SKILL.md")],
				},
			],
		});

		const rerun = await gateway.prepare({ repoRoot, descriptors: [], harnesses: ["pi"] });
		expect(rerun).toMatchObject({ ok: true, prepared: { artifacts: [] } });
		// Consumer-owned directories are outside artifact cleanup authority.
		await mkdir(join(repoRoot, ".ns/customer-data"), { recursive: true });
		await writeFile(join(repoRoot, ".ns/customer-data/value.txt"), record.spec, "utf8");
		expect(await readFile(join(repoRoot, ".ns/customer-data/value.txt"), "utf8")).toBe(record.spec);
	});

	test("a mixed safe and locally edited stale set produces diagnostics and zero activation operations", async () => {
		const root = await mkdtemp(join(tmpdir(), "ns-init-artifact-atomic-"));
		tempRoots.push(root);
		const repoRoot = join(root, "repo");
		const moduleRoot = join(root, "extension");
		for (const skill of ["edited", "safe"]) {
			await mkdir(join(moduleRoot, `skills/${skill}`), { recursive: true });
			await writeFile(join(moduleRoot, `skills/${skill}/SKILL.md`), `# ${skill}\n`, "utf8");
		}
		await mkdir(repoRoot, { recursive: true });
		const record: DeclaredExtensionDescriptor = {
			spec: "../extension",
			sourceKind: "local",
			moduleRoot,
			descriptorPath: join(moduleRoot, "extension.ts"),
			packageName: "@test/mixed",
			version: "1.0.0",
			descriptor: {
				description: "mixed",
				bundledArtifacts: [
					{ kind: "skill", name: "edited", path: "skills/edited" },
					{ kind: "skill", name: "safe", path: "skills/safe" },
				],
			},
		};
		const artifacts = new RealArtifactActivationGateway();
		const installed = await artifacts.prepare({
			repoRoot,
			descriptors: [record],
			harnesses: ["pi"],
		});
		if (!installed.ok) throw new Error(installed.error.message);
		const applied = await artifacts.apply(installed.prepared);
		if (!applied.ok) throw new Error(applied.error.message);
		const editedPath = join(repoRoot, ".pi/skills/edited/SKILL.md");
		const safePath = join(repoRoot, ".pi/skills/safe/SKILL.md");
		await writeFile(editedPath, "# customer edit\n", "utf8");

		const files = new InMemoryActivationFilesGateway();
		const result = await prepareNsActivation(
			{
				git: new InMemoryGitGateway({ optionalRepoRoot: repoRoot, trunkBranch: "main" }),
				files,
				declaredExtensions: new InMemoryDeclaredExtensionsGateway(),
				artifacts,
			},
			{
				repository: { repoRoot, trunkBranch: "main" },
				harnesses: ["pi"],
				harnessSource: "explicit",
				nsTomlContent: 'harnesses = ["pi"]\n',
				nsTomlChange: "created",
				nsTomlExpected: { type: "missing" },
			},
		);
		expect(result.type).toBe("preflight-failed");
		if (result.type !== "preflight-failed") return;
		expect(result.diagnostics).toContainEqual({
			code: "artifact-local-conflict",
			message: "Artifact @test/mixed:edited conflicts with local files for pi.",
		});
		expect(files.operations()).toEqual([]);
		expect(await readFile(editedPath, "utf8")).toBe("# customer edit\n");
		expect(await readFile(safePath, "utf8")).toBe("# safe\n");
	});

	test.each([
		["artifact directory", "artifact"],
		["intermediate directory", "intermediate"],
	] as const)("refuses cleanup through a symlinked %s", async (_label, mode) => {
		const root = await mkdtemp(join(tmpdir(), "ns-init-artifact-symlink-"));
		tempRoots.push(root);
		const repoRoot = join(root, "repo");
		const moduleRoot = join(root, "extension");
		await mkdir(join(moduleRoot, "skills/demo/references"), { recursive: true });
		await mkdir(repoRoot, { recursive: true });
		await writeFile(join(moduleRoot, "skills/demo/SKILL.md"), "# Demo\n", "utf8");
		await writeFile(join(moduleRoot, "skills/demo/references/guide.md"), "guide\n", "utf8");
		const record: DeclaredExtensionDescriptor = {
			spec: "../extension",
			sourceKind: "local",
			moduleRoot,
			descriptorPath: join(moduleRoot, "extension.ts"),
			packageName: "@test/demo",
			version: "1.0.0",
			descriptor: {
				description: "demo",
				bundledArtifacts: [{ kind: "skill", name: "demo", path: "skills/demo" }],
			},
		};
		const gateway = new RealArtifactActivationGateway();
		const installed = await gateway.prepare({
			repoRoot,
			descriptors: [record],
			harnesses: ["pi"],
		});
		if (!installed.ok) throw new Error(installed.error.message);
		const installation = await gateway.apply(installed.prepared);
		if (!installation.ok) throw new Error(installation.error.message);

		const artifactPath = join(repoRoot, ".pi/skills/demo");
		const outsidePath = join(root, `outside-${mode}`);
		if (mode === "artifact") {
			await rm(artifactPath, { recursive: true });
			await mkdir(join(outsidePath, "references"), { recursive: true });
			await writeFile(join(outsidePath, "SKILL.md"), "# Demo\n", "utf8");
			await writeFile(join(outsidePath, "references/guide.md"), "guide\n", "utf8");
			await symlink(outsidePath, artifactPath, "dir");
		} else {
			const intermediatePath = join(artifactPath, "references");
			await rm(intermediatePath, { recursive: true });
			await mkdir(outsidePath, { recursive: true });
			await writeFile(join(outsidePath, "guide.md"), "guide\n", "utf8");
			await symlink(outsidePath, intermediatePath, "dir");
		}

		const removal = await gateway.prepare({ repoRoot, descriptors: [], harnesses: ["pi"] });

		expect(removal).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		expect(
			await readFile(join(outsidePath, mode === "artifact" ? "SKILL.md" : "guide.md"), "utf8"),
		).toBe(mode === "artifact" ? "# Demo\n" : "guide\n");
	});

	test("refuses cleanup when the harness target root is symlinked outside the project", async () => {
		const { gateway, repoRoot } = await installedArtifact(["pi"]);
		const harnessRoot = join(repoRoot, ".pi/skills");
		const outsideRoot = join(repoRoot, "../outside-harness-root");
		await rename(harnessRoot, outsideRoot);
		await symlink(outsideRoot, harnessRoot, "dir");

		const removal = await gateway.prepare({ repoRoot, descriptors: [], harnesses: ["pi"] });

		expect(removal).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		await expect(readFile(join(outsideRoot, "demo/SKILL.md"), "utf8")).resolves.toBe("# Demo\n");
	});

	test("refuses a fresh provision through an existing symlinked intermediate directory", async () => {
		const { gateway, repoRoot, record } = await uninstalledArtifact();
		const outsideRoot = join(repoRoot, "../outside-fresh-provision");
		await mkdir(outsideRoot, { recursive: true });
		await symlink(outsideRoot, join(repoRoot, ".pi"), "dir");

		const prepared = await gateway.prepare({
			repoRoot,
			descriptors: [record],
			harnesses: ["pi"],
		});

		expect(prepared).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		await expect(readFile(join(outsideRoot, "skills/demo/SKILL.md"), "utf8")).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
	});

	test("rechecks a fresh provision immediately before writing", async () => {
		const { gateway, repoRoot, record } = await uninstalledArtifact();
		const prepared = await gateway.prepare({
			repoRoot,
			descriptors: [record],
			harnesses: ["pi"],
		});
		if (!prepared.ok) throw new Error(prepared.error.message);
		const outsideRoot = join(repoRoot, "../outside-late-symlink");
		await mkdir(outsideRoot, { recursive: true });
		await symlink(outsideRoot, join(repoRoot, ".pi"), "dir");

		const applied = await gateway.apply(prepared.prepared);

		expect(applied).toMatchObject({ ok: false, error: { code: "unsafe_manifest_entry" } });
		await expect(readFile(join(outsideRoot, "skills/demo/SKILL.md"), "utf8")).rejects.toMatchObject(
			{
				code: "ENOENT",
			},
		);
	});

	test("reports deselected-harness cleanup", async () => {
		const { gateway, repoRoot, record } = await installedArtifact(["pi", "codex"]);
		const removal = await gateway.prepare({ repoRoot, descriptors: [record], harnesses: ["pi"] });
		expect(removal.ok).toBe(true);
		if (!removal.ok) return;
		const applied = await gateway.apply(removal.prepared);
		if (!applied.ok) throw new Error(JSON.stringify(applied.error));
		expect(applied.completed.find((outcome) => outcome.harness === "codex")).toMatchObject({
			action: "removed",
			harness: "codex",
			removalReason: "deselected-harness",
		});
	});
});

async function uninstalledArtifact(): Promise<{
	gateway: RealArtifactActivationGateway;
	repoRoot: string;
	record: DeclaredExtensionDescriptor;
}> {
	const root = await mkdtemp(join(tmpdir(), "ns-init-artifact-cleanup-"));
	tempRoots.push(root);
	const repoRoot = join(root, "repo");
	const moduleRoot = join(root, "extension");
	await mkdir(join(moduleRoot, "skills/demo"), { recursive: true });
	await mkdir(repoRoot, { recursive: true });
	await writeFile(join(moduleRoot, "skills/demo/SKILL.md"), "# Demo\n", "utf8");
	const record: DeclaredExtensionDescriptor = {
		spec: "../extension",
		sourceKind: "local",
		moduleRoot,
		descriptorPath: join(moduleRoot, "extension.ts"),
		packageName: "@test/demo",
		version: "1.0.0",
		descriptor: {
			description: "demo",
			bundledArtifacts: [{ kind: "skill", name: "demo", path: "skills/demo" }],
		},
	};
	return { gateway: new RealArtifactActivationGateway(), repoRoot, record };
}

async function installedArtifact(harnesses: readonly ("pi" | "codex")[]): Promise<{
	gateway: RealArtifactActivationGateway;
	repoRoot: string;
	record: DeclaredExtensionDescriptor;
}> {
	const { gateway, repoRoot, record } = await uninstalledArtifact();
	const prepared = await gateway.prepare({ repoRoot, descriptors: [record], harnesses });
	if (!prepared.ok) throw new Error(prepared.error.message);
	const applied = await gateway.apply(prepared.prepared);
	if (!applied.ok) throw new Error(applied.error.message);
	return { gateway, repoRoot, record };
}
