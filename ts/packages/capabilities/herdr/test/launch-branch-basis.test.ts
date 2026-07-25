import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import {
	formatCurrentBranchChoice,
	LOCAL_TRUNK_CHOICE_LABEL,
	resolveLaunchBranchBasis,
} from "../src/core/launch-branch-basis.ts";
import { FakeCommandContext, ROOT } from "./herdr-test-harness.ts";

describe("resolveLaunchBranchBasis", () => {
	test.each(["main", "master"])("selects local trunk automatically on %s", async (branch) => {
		const git = new InMemoryGitGateway({ currentBranch: branch });
		const ctx = new FakeCommandContext({ cwd: ROOT });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "selected",
			basis: "trunk",
		});
		expect(ctx.selections).toEqual([]);
		expect(ctx.confirmations).toEqual([]);
		expect(git.currentBranchCalls).toEqual([{ cwd: ROOT }]);
	});

	test("selects the named current branch", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/contextual-launch" });
		const ctx = new FakeCommandContext({ cwd: ROOT, selectIndices: [0] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "selected",
			basis: "current",
			currentBranch: "feature/contextual-launch",
		});
		expect(ctx.selections[0]?.items).toEqual([
			formatCurrentBranchChoice("feature/contextual-launch"),
			LOCAL_TRUNK_CHOICE_LABEL,
		]);
	});

	test("selects local trunk for a named feature branch", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/contextual-launch" });
		const ctx = new FakeCommandContext({ cwd: ROOT, selectIndices: [1] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "selected",
			basis: "trunk",
		});
	});

	test("treats selector cancellation as cancellation", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/contextual-launch" });
		const ctx = new FakeCommandContext({ cwd: ROOT, shouldCancelSelect: true });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "cancelled",
		});
	});

	test("confirms local trunk for detached HEAD", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const ctx = new FakeCommandContext({ cwd: ROOT, confirmValues: [true] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "selected",
			basis: "trunk",
		});
		expect(ctx.confirmations[0]?.message).toContain("detached");
	});

	test("declining detached-HEAD fallback cancels", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const ctx = new FakeCommandContext({ cwd: ROOT, confirmValues: [false] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "cancelled",
		});
	});

	test("bounds lookup failure context before confirmed fallback", async () => {
		const git = new InMemoryGitGateway({
			currentBranch: {
				type: "failure",
				error: { code: "current-branch-failed", message: "x".repeat(800) },
			},
		});
		const ctx = new FakeCommandContext({ cwd: ROOT, confirmValues: [true] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "selected",
			basis: "trunk",
		});
		expect(ctx.confirmations[0]?.message.length).toBeLessThan(700);
		expect(ctx.confirmations[0]?.message).toContain("could not be determined");
	});

	test("declining lookup-failure fallback cancels", async () => {
		const git = new InMemoryGitGateway({
			currentBranch: {
				type: "failure",
				error: { code: "current-branch-failed", message: "git lookup failed" },
			},
		});
		const ctx = new FakeCommandContext({ cwd: ROOT, confirmValues: [false] });

		await expect(resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx })).resolves.toEqual({
			type: "cancelled",
		});
	});

	test("fails before selection when interactive UI is unavailable", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/contextual-launch" });
		const ctx = new FakeCommandContext({ cwd: ROOT, hasUI: false });

		const result = await resolveLaunchBranchBasis({ cwd: ROOT, git, interaction: ctx });
		expect(result.type).toBe("failed");
		if (result.type === "failed")
			expect(result.message).toContain("Rerun this command interactively");
		expect(ctx.selections).toEqual([]);
	});

	test("fails before selection when the select method is unavailable", async () => {
		const git = new InMemoryGitGateway({ currentBranch: "feature/contextual-launch" });
		const ctx = new FakeCommandContext({ cwd: ROOT });
		const interaction = {
			hasUI: true,
			ui: { notify: ctx.ui.notify },
		};

		const result = await resolveLaunchBranchBasis({ cwd: ROOT, git, interaction });
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("choose the current branch or local trunk");
			expect(result.message).toContain("Rerun this command interactively");
		}
	});

	test("fails before confirmation when the confirm method is unavailable", async () => {
		const git = new InMemoryGitGateway({ currentBranch: { type: "detached" } });
		const ctx = new FakeCommandContext({ cwd: ROOT });
		const interaction = {
			hasUI: true,
			ui: { notify: ctx.ui.notify },
		};

		const result = await resolveLaunchBranchBasis({ cwd: ROOT, git, interaction });
		expect(result.type).toBe("failed");
		if (result.type === "failed") {
			expect(result.message).toContain("detached");
			expect(result.message).toContain("Rerun this command interactively");
		}
	});
});
