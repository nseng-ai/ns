import { createManualClock } from "@nseng-ai/foundation/time/testing";
import { noopNsCommandIo, noopNsProgress, type NsExtensionApi } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";

import {
	MAX_GH_STACK_LIST_LIMIT,
	createGhStackListNsCommand,
	renderGhStackList,
} from "../../src/ns/commands/list.ts";
import type { GhStackInventory, GhStackInventoryItem } from "../../src/core/types.ts";
import type { GhStackListContext } from "../../src/core/gateways/contracts.ts";

const CREATED_AT = "2026-06-14T10:00:00Z";
const NOW_MS = Date.parse("2026-06-14T12:00:00Z");

function item(overrides: Partial<GhStackInventoryItem> = {}): GhStackInventoryItem {
	return {
		number: 128,
		branches: ["bounded-api", "bounded-ui"],
		bottomBranch: "bounded-api",
		topBranch: "bounded-ui",
		base: "main",
		type: "remote",
		status: { merged: 0, open: 2, closed: 0, unpushed: 0 },
		createdAt: CREATED_AT,
		...overrides,
	};
}

function inventory(
	stacks: readonly GhStackInventoryItem[],
	limit = 100,
	total = stacks.length,
): GhStackInventory {
	return { stacks, limit, returned: stacks.length, total, truncated: stacks.length < total };
}

function context(
	options: {
		local?: GhStackInventoryItem;
		failure?: "installation" | "local" | "remote";
	} = {},
): GhStackListContext {
	return {
		installation: {
			async verifyInstallation() {
				return options.failure === "installation"
					? {
							ok: false as const,
							error: {
								type: "gh-stack-extension-unavailable" as const,
								evidence: { command: "gh stack --version", summary: "missing" },
							},
						}
					: { ok: true as const, version: "0.1.0" };
			},
		},
		local: {
			async loadLocalStacks() {
				return options.failure === "local"
					? {
							ok: false as const,
							error: {
								type: "git-repository-unavailable" as const,
								evidence: { cwd: "/repo", summary: "not a repository" },
							},
						}
					: { ok: true as const, value: [] };
			},
		},
		remote: {
			async loadRemoteStacks() {
				return options.failure === "remote"
					? {
							ok: false as const,
							error: {
								type: "github-stack-discovery-failed" as const,
								evidence: { command: "gh api", summary: "offline" },
							},
						}
					: { ok: true as const, value: [] };
			},
		},
	};
}

const api = {
	cwd: "/repo",
	env: {},
	hasExtension: () => false,
	exec: async () => {
		throw new Error("unexpected execution");
	},
	textGenerator: { generateText: async () => ({ ok: false as const, error: "unused" }) },
	commandIo: noopNsCommandIo,
	progress: noopNsProgress,
	renderCapabilities: { canEmitAnsi: false },
	isInteractive: () => false,
	confirm: () => {
		throw new Error("unexpected prompt");
	},
	select: () => {
		throw new Error("unexpected prompt");
	},
} satisfies NsExtensionApi;

async function run(request: unknown, listContext = context()) {
	const command = createGhStackListNsCommand({
		createContext: () => listContext,
		clock: createManualClock(NOW_MS).clock,
	});
	const parsed = command.schema.parse(request);
	return await command.handler(api, parsed);
}

describe("gh-stack list command", () => {
	test("defaults to 100 and returns the exact bounded result shape", async () => {
		await expect(run({})).resolves.toEqual({
			status: "success",
			data: { stacks: [], limit: 100, returned: 0, total: 0, truncated: false },
		});
	});

	test.each([
		["zero", "0"],
		["negative", "-1"],
		["noninteger", "1.5"],
		["text", "many"],
		["over maximum", String(MAX_GH_STACK_LIST_LIMIT + 1)],
	])("returns structured usage data for %s limit", async (_label, limit) => {
		await expect(run({ limit })).resolves.toMatchObject({
			status: "usage-error",
			errorType: "usage-error",
			data: { argument: "--limit", value: limit, minimum: 1, maximum: MAX_GH_STACK_LIST_LIMIT },
		});
	});

	test.each(["installation", "local", "remote"] as const)(
		"maps strict %s failure without partial inventory",
		async (failureType) => {
			const result = await run({}, context({ failure: failureType }));
			expect(result.status).toBe("failure");
			expect(result).not.toHaveProperty("data.stacks");
		},
	);
});

describe("gh-stack list renderer", () => {
	const clock = createManualClock(NOW_MS).clock;

	test("renders the fixed table semantics and relative ages", () => {
		const text = renderGhStackList(
			inventory([
				item({
					number: null,
					branches: ["local-api", "local-ui"],
					bottomBranch: "local-api",
					topBranch: "local-ui",
					type: "local",
					status: { merged: 1, open: 2, closed: 3, unpushed: 4 },
					createdAt: null,
				}),
				item(),
			]),
			clock,
		);
		expect(text).toContain("NUMBER  BRANCHES");
		expect(text).toContain("—       local-api...local-ui");
		expect(text).toContain("1 merged, 2 open, 3 closed, 4 unpushed");
		expect(text).toContain("Local");
		expect(text).toContain("Remote  2h ago");
	});

	test("renders exact empty output and actionable truncation guidance", () => {
		expect(renderGhStackList(inventory([]), clock)).toBe("No active stacks found.");
		expect(renderGhStackList(inventory([item()], 1, 3), clock)).toContain(
			"Showing 1 of 3 stacks. Run `ns gs list --limit 3` to show more.",
		);
	});
});
