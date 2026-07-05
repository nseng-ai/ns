import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/core/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/core/fake-storage.ts";
import {
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../src/core/operations/load-orientations.ts";
import { ObjectiveStorage } from "../../src/core/storage.ts";

describe("objective load-orientations operation", () => {
	test("selects active open records with direct orientation files", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ slug: "alpha", orientationMd: "alpha direction\n" },
				{ slug: "bravo", orientationMd: "bravo direction\n", isClosed: true },
				{ slug: "charlie" },
				{ slug: "delta", orientationMd: "delta direction" },
			],
			directories: [".ns/objective-archive/archived"],
			files: {
				".ns/objective-archive/archived/orientation.md": "archived direction\n",
			},
		});

		const exit = await runLoadOrientations(ctx, {});

		expect(exit).toEqual({
			type: "ok",
			data: {
				rootPath: ".ns/objectives",
				records: [
					{
						slug: "alpha",
						path: ".ns/objectives/alpha/orientation.md",
						content: "alpha direction\n",
					},
					{
						slug: "delta",
						path: ".ns/objectives/delta/orientation.md",
						content: "delta direction",
					},
				],
				recordCount: 2,
			},
		});
		expect(ctx.git.hasUncommittedChangesUnderCalls).toEqual([]);
	});

	test("orders records deterministically by checkout slug", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ slug: "charlie", orientationMd: "charlie\n" },
				{ slug: "alpha", orientationMd: "alpha\n" },
			],
		});

		const exit = await runLoadOrientations(ctx, {});

		if (exit.type !== "ok") throw new Error("expected ok exit");
		expect(exit.data.records.map((record) => record.slug)).toEqual(["alpha", "charlie"]);
	});

	test("renders headers plus raw content with normalized trailing newlines", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ slug: "alpha", orientationMd: "alpha content\n\n" },
				{ slug: "charlie", orientationMd: "charlie content" },
			],
		});
		const exit = await runLoadOrientations(ctx, {});
		if (exit.type !== "ok") throw new Error("expected ok exit");

		expect(renderLoadOrientationsMarkdown(exit.data)).toBe(
			[
				"### .ns/objectives/alpha/orientation.md",
				"alpha content",
				"",
				"### .ns/objectives/charlie/orientation.md",
				"charlie content",
			].join("\n"),
		);
	});

	test("orientation output is identical for records with and without Record Frontmatter", async () => {
		// Orientation content passes through verbatim: a leading --- fence in
		// orientation.md and Record Frontmatter in objective.md must never be
		// treated as strippable content by the orientation loader.
		const orientationMd = "---\nnot frontmatter, orientation prose\n---\nalpha direction\n";
		const loadWithObjectiveMd = async (objectiveMd: string) =>
			await runLoadOrientations(
				contextWithFakeStorage({ records: [{ slug: "alpha", objectiveMd, orientationMd }] }),
				{},
			);

		const withoutFrontmatter = await loadWithObjectiveMd("# alpha\n");
		const withFrontmatter = await loadWithObjectiveMd(
			"---\nblocked: Gated on an upstream landing.\nedges: []\n---\n# alpha\n",
		);

		if (withoutFrontmatter.type !== "ok") throw new Error("expected ok exit");
		expect(withoutFrontmatter.data.records).toEqual([
			{
				slug: "alpha",
				path: ".ns/objectives/alpha/orientation.md",
				content: orientationMd,
			},
		]);
		expect(withFrontmatter).toEqual(withoutFrontmatter);
	});

	test("fails when a detected orientation file is unreadable", async () => {
		const ctx = contextWithFakeStorage({
			records: [{ slug: "alpha", orientationMd: "alpha\n" }],
			unreadableFiles: { ".ns/objectives/alpha/orientation.md": "permission denied" },
		});

		const exit = await runLoadOrientations(ctx, {});

		expect(exit).toEqual({
			type: "failure",
			errorType: "orientation-unreadable",
			message: "Unable to read .ns/objectives/alpha/orientation.md: permission denied",
		});
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
}

function contextWithFakeStorage(fake: FakeObjectiveStorageGatewayOptions): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "master",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(),
	};
}
