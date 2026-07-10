import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { DeclaredExtensionDescriptor } from "@nseng-ai/kernel/extensions/declared-descriptors";

import { RealArtifactActivationGateway } from "../../src/real-artifact-activation.ts";

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
});
