import { InMemoryGitGateway } from "@sdl/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { ObjectiveCliContext } from "../../src/context.ts";
import {
	FakeObjectiveStorageGateway,
	type FakeObjectiveStorageGatewayOptions,
} from "../../src/fake-storage.ts";
import { FakeAutopilotGateway } from "../../src/operations/autopilot/fake-gateway.ts";
import { runAutopilotPreflight } from "../../src/operations/autopilot/preflight.ts";
import { ObjectiveStorage } from "../../src/storage.ts";

describe("objective autopilot preflight operation", () => {
	test("passes for a clean worktree, open Objective, and non-trunk branch", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{ currentBranch: "feature/flow-cleanup" },
		);

		const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

		expect(exit).toEqual({
			type: "ok",
			data: {
				ok: true,
				slug: "flow-cleanup",
				startBranch: "feature/flow-cleanup",
				trunk: "main",
				violations: [],
			},
		});
	});

	test("reports worktree-dirty when the repository has uncommitted changes", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{ currentBranch: "feature/flow-cleanup", dirtyPaths: ["."] },
		);

		const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["worktree-dirty"] },
		});
	});

	test("reports objective-not-found for a missing slug", async () => {
		const ctx = contextWithFakeStorage({ records: [] }, { currentBranch: "feature/missing" });

		const exit = await runAutopilotPreflight(ctx, { slug: "missing" });

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["objective-not-found"] },
		});
	});

	test("reports objective-closed for a closed Objective", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup", isClosed: true }] },
			{ currentBranch: "feature/flow-cleanup" },
		);

		const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["objective-closed"] },
		});
	});

	test("reports on-trunk for main and master", async () => {
		for (const trunkBranch of ["main", "master"]) {
			const ctx = contextWithFakeStorage(
				{ records: [{ slug: "flow-cleanup" }] },
				{ currentBranch: trunkBranch },
			);

			const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

			expect(exit).toMatchObject({
				type: "negative",
				data: { ok: false, violations: ["on-trunk"] },
			});
		}
	});

	test("collects multiple simultaneous violations", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [] },
			{ currentBranch: "main", dirtyPaths: ["."] },
		);

		const exit = await runAutopilotPreflight(ctx, { slug: "missing" });

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, violations: ["worktree-dirty", "objective-not-found", "on-trunk"] },
		});
	});

	test("returns usageError for a missing slug", async () => {
		const ctx = contextWithFakeStorage({ records: [] });

		const exit = await runAutopilotPreflight(ctx, {});

		expect(exit).toMatchObject({ type: "usageError" });
	});

	test("returns usageError for an invalid slug", async () => {
		const ctx = contextWithFakeStorage({ records: [] });

		const exit = await runAutopilotPreflight(ctx, { slug: "has/slash" });

		expect(exit).toMatchObject({ type: "usageError" });
	});
});

interface FakeObjectiveCliContext extends ObjectiveCliContext {
	git: InMemoryGitGateway;
}

function contextWithFakeStorage(
	fake: FakeObjectiveStorageGatewayOptions,
	gitState: ConstructorParameters<typeof InMemoryGitGateway>[0] = {},
): FakeObjectiveCliContext {
	return {
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
		repoRoot: "/repo",
		trunkBranch: "main",
		storage: new ObjectiveStorage(new FakeObjectiveStorageGateway(fake)),
		git: new InMemoryGitGateway(gitState),
		autopilot: new FakeAutopilotGateway(),
	};
}
