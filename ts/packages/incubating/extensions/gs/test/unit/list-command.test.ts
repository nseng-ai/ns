import { describe, expect, it } from "vitest";

import type { GsLocalInventoryGateway } from "../../src/core/local-inventory.ts";
import {
	createGsListCommand,
	gsListRequestDecl,
	gsListResultDecl,
	renderGsListHuman,
} from "../../src/core/list-command.ts";
import { createFakeApi } from "../support/fake-api.ts";

const INVENTORY = {
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
	it("supplies concrete memoized schemas to the SDK boundary", () => {
		const command = createGsListCommand({ createGateway: () => gatewayFor(INVENTORY) });

		expect(command.schema).toBe(gsListRequestDecl.schema);
		expect(command.resultSchema).toBe(gsListResultDecl.schema);
	});

	it("returns the complete inventory without changing branch order", async () => {
		const command = createGsListCommand({ createGateway: () => gatewayFor(INVENTORY) });

		await expect(command.handler(createFakeApi(), { verbose: false })).resolves.toEqual({
			status: "success",
			data: INVENTORY,
		});
	});

	it("rejects verbose JSON with both conflicting flags named", async () => {
		const command = createGsListCommand({ createGateway: () => gatewayFor(INVENTORY) });
		await expect(
			command.handler(createFakeApi({ outputFormat: "json" }), { verbose: true }),
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
		const command = createGsListCommand({
			createGateway: () => ({
				async readLocalInventory() {
					return { ok: false, error: { type, message: "x".repeat(800) } };
				},
			}),
		});
		const outcome = await command.handler(createFakeApi(), { verbose: false });
		expect(outcome).toMatchObject({
			status: "failure",
			errorType: type,
			message,
			data: { code: type },
		});
		if (outcome.status !== "failure") throw new Error("Expected failure.");
		expect((outcome.data as { detail: string }).detail).toHaveLength(500);
	});
});

describe("gs list human renderer", () => {
	it("renders the exact compact table", () => {
		expect(renderGsListHuman(INVENTORY, false)).toBe(
			"NUMBER  STACK         BASE\n12      bottom...top  main\n—       solo          trunk",
		);
	});

	it("renders verbose stacks top-to-bottom with bases and blank separation", () => {
		expect(renderGsListHuman(INVENTORY, true)).toBe(
			"12\n ├─ top\n ├─ bottom\n └─ main (base)\n\n(no number)\n ├─ solo\n └─ trunk (base)",
		);
	});

	it("renders the exact empty message in both modes", () => {
		for (const verbose of [false, true]) {
			expect(renderGsListHuman({ stacks: [] }, verbose)).toBe("No local gh-stack stacks found.");
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
