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
		const git = new InMemoryGitGateway({
			optionalRepoRoot: repoRoot,
			existingRefs: ["refs/heads/develop", "refs/remotes/upstream/develop"],
		});
		const context = await createRealObjectiveContext({ cwd: repoRoot, git });

		expect(context.trunkBranch).toBe("develop");
		expect(git.exactRefPresenceCalls).toEqual([]);
	});

	test("creates identity-only context when the resolved local trunk ref is absent", async () => {
		const repoRoot = await mkdtemp(join(tmpdir(), "objective-context-failure-"));
		await writeFile(join(repoRoot, "ns.toml"), '[git]\nremote = "upstream"\ntrunk = "develop"\n');
		const git = new InMemoryGitGateway({ optionalRepoRoot: repoRoot });
		const context = await createRealObjectiveContext({ cwd: repoRoot, git });

		expect(context.trunkBranch).toBe("develop");
		expect(git.exactRefPresenceCalls).toEqual([]);
	});
});
