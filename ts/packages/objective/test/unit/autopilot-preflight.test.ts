import { type InMemoryGitGatewayState } from "@sdl/capability-kit/git/testing";
import { describe, expect, test } from "vitest";

import type { FakeObjectiveStorageGatewayOptions } from "../../src/fake-storage.ts";
import { runAutopilotPreflight } from "../../src/operations/autopilot/preflight.ts";
import {
	createFakeObjectiveContext,
	type FakeObjectiveCliContext,
} from "../support/fake-objective-context.ts";

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

	test("reports on-trunk when the current branch matches the configured trunk", async () => {
		const ctx = contextWithFakeStorage(
			{ records: [{ slug: "flow-cleanup" }] },
			{ currentBranch: "develop" },
			{ trunkBranch: "develop" },
		);

		const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

		expect(exit).toMatchObject({
			type: "negative",
			data: { ok: false, trunk: "develop", violations: ["on-trunk"] },
		});
	});

	test("does not treat main or master as trunk aliases when configured trunk differs", async () => {
		for (const currentBranch of ["main", "master"]) {
			const ctx = contextWithFakeStorage(
				{ records: [{ slug: "flow-cleanup" }] },
				{ currentBranch },
				{ trunkBranch: "develop" },
			);

			const exit = await runAutopilotPreflight(ctx, { slug: "flow-cleanup" });

			expect(exit).toMatchObject({
				type: "ok",
				data: { ok: true, startBranch: currentBranch, trunk: "develop", violations: [] },
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

function contextWithFakeStorage(
	fake: FakeObjectiveStorageGatewayOptions,
	gitState: InMemoryGitGatewayState = {},
	options: { trunkBranch?: string } = {},
): FakeObjectiveCliContext {
	return createFakeObjectiveContext({
		storageState: fake,
		gitState,
		...(options.trunkBranch === undefined ? {} : { trunkBranch: options.trunkBranch }),
	});
}
