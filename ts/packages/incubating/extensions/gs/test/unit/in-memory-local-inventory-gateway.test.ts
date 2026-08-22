import { describe, expect, it } from "vitest";

import type { GsLocalInventoryResult } from "../../src/core/local-inventory.ts";
import { InMemoryGsLocalInventoryGateway } from "../../src/core/testing/in-memory-local-inventory-gateway.ts";

describe("InMemoryGsLocalInventoryGateway", () => {
	it("copies constructor state and each returned inventory", async () => {
		const branches = [{ name: "feature", pullRequest: null }];
		const stacks = [{ number: null, base: "main", branches }];
		const state: GsLocalInventoryResult = { ok: true, value: { stacks } };
		const gateway = new InMemoryGsLocalInventoryGateway(state);

		branches.push({ name: "constructor-mutation", pullRequest: null });
		const first = await gateway.readLocalInventory({ cwd: "/one" });
		if (!first.ok) throw new Error(first.error.message);
		expect(first.value.stacks[0]?.branches).toEqual([{ name: "feature", pullRequest: null }]);

		const mutableFirst = first.value.stacks as Array<(typeof first.value.stacks)[number]>;
		mutableFirst.length = 0;
		const second = await gateway.readLocalInventory({ cwd: "/two" });
		expect(second).toEqual({
			ok: true,
			value: {
				stacks: [
					{
						number: null,
						base: "main",
						branches: [{ name: "feature", pullRequest: null }],
					},
				],
			},
		});
	});

	it("copies failure state", async () => {
		const gateway = new InMemoryGsLocalInventoryGateway({
			ok: false,
			error: { type: "gh-stack-state-read-failed", message: "denied" },
		});
		await expect(gateway.readLocalInventory({ cwd: "/repo" })).resolves.toEqual({
			ok: false,
			error: { type: "gh-stack-state-read-failed", message: "denied" },
		});
	});
});
