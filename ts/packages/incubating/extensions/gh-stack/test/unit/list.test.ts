import { describe, expect, test } from "vitest";

import { listGhStacks } from "../../src/core/list.ts";
import type { GhStackListContext } from "../../src/core/gateways/contracts.ts";

function context(overrides: Partial<GhStackListContext> = {}): GhStackListContext {
	return {
		installation: {
			async verifyInstallation() {
				return { ok: true, version: "0.1.0" };
			},
		},
		local: {
			async loadLocalStacks() {
				return { ok: true, value: [] };
			},
		},
		remote: {
			async loadRemoteStacks() {
				return { ok: true, value: [] };
			},
		},
		...overrides,
	};
}

describe("listGhStacks", () => {
	test("returns the stable empty result shape", async () => {
		await expect(listGhStacks({ context: context(), limit: 100 })).resolves.toEqual({
			ok: true,
			value: { stacks: [], limit: 100, returned: 0, total: 0, truncated: false },
		});
	});

	test("stops on boundary failure without returning partial inventory", async () => {
		const result = await listGhStacks({
			context: context({
				remote: {
					async loadRemoteStacks() {
						return {
							ok: false,
							error: {
								type: "github-stack-discovery-failed",
								evidence: { summary: "offline" },
							},
						};
					},
				},
			}),
			limit: 100,
		});
		expect(result).toEqual({
			ok: false,
			error: { type: "github-stack-discovery-failed", evidence: { summary: "offline" } },
		});
		expect(result).not.toHaveProperty("value.stacks");
	});
});
