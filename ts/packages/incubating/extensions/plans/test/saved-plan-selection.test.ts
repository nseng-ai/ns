import { describe, expect, test } from "vitest";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import type { CommandExecApi } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import {
	buildRepoPlanStoreKey,
	encodeBranchForPlanPath,
	resolveExplicitSavedPlanFile,
	resolveSelectedSavedPlanFile,
} from "../src/index.ts";
import { InMemoryPlanStoreGateway } from "../src/testing.ts";

const commands: CommandExecApi = {
	async exec() {
		throw new Error("unexpected command execution");
	},
};
const sourceBranch = "feature/source-plan";
const origin = "git@github.com:owner/repo.git";

describe("durable Saved Plan selection", () => {
	test("resolves timestamped and legacy explicit paths with parsed filename details", async () => {
		const fixture = makeFixture();
		const timestamped = join(fixture.directory, "canonical-saved-plan--26-01-02T03-04-05--12.md");
		fixture.store.writeFile(timestamped, "# Timestamped\n");
		const legacy = join(fixture.directory, "canonical-saved-plan.md");
		fixture.store.writeFile(legacy, "# Legacy\n");

		await expect(
			resolveExplicitSavedPlanFile(commands, { ...fixture.options(), explicitPath: timestamped }),
		).resolves.toEqual({
			type: "resolved",
			plan: expect.objectContaining({
				format: "timestamped",
				slug: "canonical-saved-plan",
				fileName: "canonical-saved-plan--26-01-02T03-04-05--12.md",
				fileStem: "canonical-saved-plan--26-01-02T03-04-05--12",
				timestamp: "26-01-02T03-04-05",
				sequence: 12,
				content: "# Timestamped\n",
			}),
		});
		await expect(
			resolveExplicitSavedPlanFile(commands, { ...fixture.options(), explicitPath: `@${legacy}` }),
		).resolves.toEqual({
			type: "resolved",
			plan: expect.objectContaining({
				format: "legacy",
				slug: "canonical-saved-plan",
				fileStem: "canonical-saved-plan",
			}),
		});
	});

	test("normalizes a home-relative explicit Local Plan Store path", async () => {
		const root = "/repo";
		const planStoreRoot = join(homedir(), ".local", "state", "ns", "test-enriched-plan");
		const directory = join(
			planStoreRoot,
			buildRepoPlanStoreKey(root, origin),
			encodeBranchForPlanPath(sourceBranch),
		);
		const filePath = join(directory, "home-relative-saved-plan.md");
		const store = new InMemoryPlanStoreGateway();
		store.writeFile(filePath, "# Home Relative\n");
		const result = await resolveExplicitSavedPlanFile(commands, {
			cwd: root,
			planStoreRoot,
			git: new InMemoryGitGateway({
				repoRoot: root,
				currentBranch: sourceBranch,
				originUrl: origin,
			}),
			planStoreGateway: store,
			explicitPath: `~/${relative(homedir(), filePath)}`,
		});
		expect(result).toMatchObject({ type: "resolved", plan: { filePath, format: "legacy" } });
	});

	test("requires lexical and realpath containment and a regular .md file", async () => {
		const fixture = makeFixture();
		const outside = "/outside/canonical-saved-plan.md";
		fixture.store.writeFile(outside, "# Outside\n");
		await expect(
			resolveExplicitSavedPlanFile(commands, { ...fixture.options(), explicitPath: outside }),
		).resolves.toMatchObject({
			type: "unsafe",
			message: expect.stringContaining("lexically outside"),
		});
		await expect(
			resolveExplicitSavedPlanFile(commands, {
				...fixture.options(),
				explicitPath: join(fixture.directory, "missing.md"),
			}),
		).resolves.toMatchObject({ type: "unsafe" });
	});

	test("selects explicit when supplied and otherwise durable latest", async () => {
		const fixture = makeFixture();
		const legacy = join(fixture.directory, "canonical-saved-plan.md");
		fixture.store.writeFile(legacy, "# Legacy\n");
		await expect(
			resolveSelectedSavedPlanFile(commands, fixture.options(legacy)),
		).resolves.toMatchObject({
			type: "explicit",
			plan: { format: "legacy", filePath: legacy },
		});

		const latest = join(fixture.directory, "newest-saved-plan--26-01-02T03-04-05--2.md");
		fixture.store.writeFile(latest, "# Latest\n");
		await expect(resolveSelectedSavedPlanFile(commands, fixture.options())).resolves.toMatchObject({
			type: "latest",
			plan: { format: "timestamped", filePath: latest, sequence: 2 },
		});
	});
});

function makeFixture(): {
	directory: string;
	store: InMemoryPlanStoreGateway;
	options(explicitPath?: string): {
		cwd: string;
		planStoreRoot: string;
		git: InMemoryGitGateway;
		planStoreGateway: InMemoryPlanStoreGateway;
		explicitPath?: string;
	};
} {
	const root = "/repo";
	const planStoreRoot = "/plans";
	const directory = join(
		planStoreRoot,
		buildRepoPlanStoreKey(root, origin),
		encodeBranchForPlanPath(sourceBranch),
	);
	const store = new InMemoryPlanStoreGateway();
	const git = new InMemoryGitGateway({
		repoRoot: root,
		currentBranch: sourceBranch,
		originUrl: origin,
	});
	return {
		directory,
		store,
		options: (explicitPath) => ({
			cwd: root,
			planStoreRoot,
			git,
			planStoreGateway: store,
			...(explicitPath === undefined ? {} : { explicitPath }),
		}),
	};
}
