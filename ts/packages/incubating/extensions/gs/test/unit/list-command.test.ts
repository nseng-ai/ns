import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { GsLocalInventoryGateway } from "../../src/core/local-inventory.ts";
import {
	gsListRequestSchema,
	gsListResultSchema,
	renderGsListHuman,
	runGsList,
} from "../../src/core/list-command.ts";
import { command } from "../../src/ns/cli/gs/list/command.ts";

const INVENTORY = {
	worktreeGitDir: "/repo/.git/worktrees/current",
	stacks: [
		{
			number: 12,
			base: "main",
			branches: [
				{ name: "bottom", pullRequest: { number: 100, recordedMerged: true } },
				{ name: "top", pullRequest: null },
			],
		},
		{ number: null, base: "trunk", branches: [{ name: "solo", pullRequest: null }] },
	],
};

describe("gs list command", () => {
	it("unwraps the lazy request schema at the concrete SDK boundary", async () => {
		const commandDefinition = await command();

		expect(gsListRequestSchema).toBeInstanceOf(z.ZodLazy);
		expect(gsListResultSchema).toBeInstanceOf(z.ZodLazy);
		expect(commandDefinition.schema).toBeInstanceOf(z.ZodObject);
		expect(commandDefinition.resultSchema).toBe(gsListResultSchema);
	});

	it("returns the complete inventory without changing branch order", async () => {
		await expect(
			runGsList(gatewayFor(INVENTORY), { cwd: "/repo", outputFormat: "human" }, { verbose: false }),
		).resolves.toEqual({ status: "success", data: INVENTORY });
	});

	it("rejects verbose JSON with both conflicting flags named", async () => {
		await expect(
			runGsList(gatewayFor(INVENTORY), { cwd: "/repo", outputFormat: "json" }, { verbose: true }),
		).resolves.toEqual({
			status: "usage-error",
			errorType: "usage-error",
			message: "--verbose cannot be combined with --format json.",
			data: { conflictingOptions: ["--verbose", "--format json"] },
		});
	});

	it.each([
		["git-repository-unavailable", "Could not inspect the local Git repository."],
		["gh-stack-state-read-failed", "Could not read local gh-stack state."],
		["gh-stack-state-unsupported", "Local gh-stack state is malformed or unsupported."],
	] as const)("maps %s to a stable bounded failure", async (type, message) => {
		const outcome = await runGsList(
			{
				async readLocalInventory() {
					return { ok: false, error: { type, message: "x".repeat(800) } };
				},
			},
			{ cwd: "/repo", outputFormat: "human" },
			{ verbose: false },
		);
		expect(outcome).toMatchObject({
			status: "failure",
			errorType: type,
			message,
			data: { code: type },
		});
		if (outcome.status !== "failure") throw new Error("Expected failure.");
		const detail = (outcome.data as { detail: string }).detail;
		expect(detail).toHaveLength(500);
		expect(detail).toMatch(/… \[omitted \d+ chars\]$/);
	});

	it("preserves short failure details", async () => {
		const outcome = await runGsList(
			{
				async readLocalInventory() {
					return {
						ok: false,
						error: { type: "gh-stack-state-read-failed" as const, message: "read failed" },
					};
				},
			},
			{ cwd: "/repo", outputFormat: "human" },
			{ verbose: false },
		);
		if (outcome.status !== "failure") throw new Error("Expected failure.");
		expect((outcome.data as { detail: string }).detail).toBe("read failed");
	});
});

describe("gs list human renderer", () => {
	it("renders the exact compact table", () => {
		expect(renderGsListHuman(INVENTORY, false)).toBe(
			"Worktree Git directory: /repo/.git/worktrees/current\n\nNUMBER  STACK         BASE\n12      bottom...top  main\n—       solo          trunk",
		);
	});

	it("renders verbose stacks top-to-bottom with bases and blank separation", () => {
		expect(renderGsListHuman(INVENTORY, true)).toBe(
			"Worktree Git directory: /repo/.git/worktrees/current\n\n12\n ├─ top\n ├─ bottom\n └─ main (base)\n\n(no number)\n ├─ solo\n └─ trunk (base)",
		);
	});

	it("renders the exact empty message in both modes", () => {
		for (const verbose of [false, true]) {
			expect(
				renderGsListHuman({ worktreeGitDir: "/repo/.git/worktrees/current", stacks: [] }, verbose),
			).toBe(
				"Worktree Git directory: /repo/.git/worktrees/current\nNo current-worktree gh-stack stacks found.",
			);
		}
	});
});

function gatewayFor(inventory: typeof INVENTORY): GsLocalInventoryGateway {
	return {
		async readLocalInventory() {
			return { ok: true, value: inventory };
		},
	};
}
