import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { createRealObjectiveContext } from "../../src/core/context.ts";

describe("Objective context trunk resolution", () => {
	test("uses the repository trunk configured by the real Node config loader", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "objective-context-"));
		await writeFile(join(repoRoot, "ns.toml"), '[git]\nremote = "upstream"\ntrunk = "develop"\n');
		const context = await createRealObjectiveContext({
			cwd: repoRoot,
			git: new InMemoryGitGateway({
				optionalRepoRoot: repoRoot,
				existingRefs: ["refs/heads/develop", "refs/remotes/upstream/develop"],
			}),
		});

		expect(context.trunkBranch).toBe("develop");
	});

	test("wraps the canonical trunk resolution failure", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "objective-context-failure-"));
		await writeFile(join(repoRoot, "ns.toml"), '[git]\nremote = "upstream"\ntrunk = "develop"\n');
		await expect(
			createRealObjectiveContext({
				cwd: repoRoot,
				git: new InMemoryGitGateway({ optionalRepoRoot: repoRoot }),
			}),
		).rejects.toThrow(
			"Cannot create Objective context: Repository trunk local ref `refs/heads/develop` is missing.",
		);
	});
});
