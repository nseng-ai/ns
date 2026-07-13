import { describe, expect, test } from "vitest";

import { InMemoryArtifactProvisioningStatusGateway } from "../../src/testing/index.ts";

const descriptor = {
	spec: "./extension",
	sourceKind: "local" as const,
	moduleRoot: "/repo/extension",
	descriptorPath: "/repo/extension/extension.ts",
	packageName: "@test/extension",
	version: "1.0.0",
	descriptor: { description: "extension" },
};

describe("InMemoryArtifactProvisioningStatusGateway", () => {
	test("copies constructor state, returned summaries, inputs, and its read-only call log", async () => {
		const diagnostics = [{ code: "artifact-local-conflict", message: "original" }];
		const summaries = [
			{
				moduleRoot: descriptor.moduleRoot,
				artifactStatus: "conflicted" as const,
				artifactCount: 2,
				affectedArtifactCount: 1,
				diagnostics,
			},
		];
		const gateway = new InMemoryArtifactProvisioningStatusGateway({ summaries });
		diagnostics[0]!.message = "mutated after construction";
		const descriptors = [descriptor];
		const harnesses: ("pi" | "codex")[] = ["pi"];

		const first = await gateway.inspect({ repoRoot: "/repo", descriptors, harnesses });
		descriptors.length = 0;
		harnesses.push("codex");
		const second = await gateway.inspect({
			repoRoot: "/repo",
			descriptors: [descriptor],
			harnesses: ["pi"],
		});

		expect(first).toEqual([
			{
				moduleRoot: descriptor.moduleRoot,
				artifactStatus: "conflicted",
				artifactCount: 2,
				affectedArtifactCount: 1,
				diagnostics: [{ code: "artifact-local-conflict", message: "original" }],
			},
		]);
		expect(first).not.toBe(second);
		expect(first[0]?.diagnostics).not.toBe(second[0]?.diagnostics);
		expect(gateway.inspectCalls()).toEqual([
			{ repoRoot: "/repo", descriptors: [descriptor], harnesses: ["pi"] },
			{ repoRoot: "/repo", descriptors: [descriptor], harnesses: ["pi"] },
		]);
		expect(gateway.inspectCalls()).not.toBe(gateway.inspectCalls());
	});

	test("defaults to one none summary per requested descriptor", async () => {
		const gateway = new InMemoryArtifactProvisioningStatusGateway();

		await expect(
			gateway.inspect({ repoRoot: "/repo", descriptors: [descriptor], harnesses: ["pi"] }),
		).resolves.toEqual([
			{
				moduleRoot: descriptor.moduleRoot,
				artifactStatus: "none",
				artifactCount: 0,
				affectedArtifactCount: 0,
				diagnostics: [],
			},
		]);
	});
});
