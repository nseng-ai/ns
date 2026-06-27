import { InMemoryGitGateway } from "@sdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/fake-storage.ts";
import {
	renderLoadOrientationsMarkdown,
	runLoadOrientations,
} from "../../src/operations/load-orientations.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

describe("objective load-orientations operation", () => {
	test("selects active open records with direct orientation files", async () => {
		const ctx = contextWithFakeStorage({
			records: [
				{ slug: "alpha", orientationMd: "alpha direction\n" },
				{ slug: "bravo", orientationMd: "bravo direction\n", isClosed: true },
				{ slug: "charlie" },
				{ slug: "delta", orientationMd: "delta direction" },
			],
			directories: [".sdl/objective-archive/archived"],
			files: {
				".sdl/objective-archive/archived/orientation.md": "archived direction\n",
			},
		});

		const exit = await runLoadOrientations(ctx, {});

		expect(exit).toEqual({
			type: "ok",
			data: {
				rootPath: ".sdl/objectives",
				records: [
					{
						slug: "alpha",
						path: ".sdl/objectives/alpha/orientation.md",
						content: "alpha direction\n",
					},
					{
						slug: "delta",
						path: ".sdl/objectives/delta/orientation.md",
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
				"### .sdl/objectives/alpha/orientation.md",
				"alpha content",
				"",
				"### .sdl/objectives/charlie/orientation.md",
				"charlie content",
			].join("\n"),
		);
	});

	test("fails when a detected orientation file is unreadable", async () => {
		const ctx = contextWithFakeStorage({
			records: [{ slug: "alpha", orientationMd: "alpha\n" }],
			unreadableFiles: { ".sdl/objectives/alpha/orientation.md": "permission denied" },
		});

		const exit = await runLoadOrientations(ctx, {});

		expect(exit).toEqual({
			type: "failure",
			errorType: "orientation-unreadable",
			message: "Unable to read .sdl/objectives/alpha/orientation.md: permission denied",
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
