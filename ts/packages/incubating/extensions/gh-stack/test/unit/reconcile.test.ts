import { describe, expect, test } from "vitest";

import { reconcileGhStackInventory } from "../../src/core/reconcile.ts";
import type { LocalStack, RemoteStack } from "../../src/core/types.ts";

function local(overrides: Partial<LocalStack> = {}): LocalStack {
	return {
		id: null,
		number: null,
		base: "main",
		branches: [{ name: "local", pullRequest: null }],
		...overrides,
	};
}

function remote(overrides: Partial<RemoteStack> = {}): RemoteStack {
	return {
		id: "1",
		number: 1,
		base: "main",
		createdAt: "2026-01-01T00:00:00.000Z",
		pullRequests: [{ number: 10, state: "open", mergedAt: null, branch: "remote" }],
		...overrides,
	};
}

function reconcile(
	localStacks: readonly LocalStack[],
	remoteStacks: readonly RemoteStack[],
	limit = 100,
) {
	return reconcileGhStackInventory({ local: localStacks, remote: remoteStacks, limit });
}

describe("reconcileGhStackInventory", () => {
	test("includes unpublished local-only stacks and preserves complete branch order", () => {
		const result = reconcile(
			[
				local({
					branches: [
						{ name: "bottom", pullRequest: null },
						{ name: "middle", pullRequest: null },
						{ name: "top", pullRequest: null },
					],
				}),
			],
			[],
		);

		expect(result).toEqual({
			ok: true,
			value: {
				stacks: [
					{
						number: null,
						branches: ["bottom", "middle", "top"],
						bottomBranch: "bottom",
						topBranch: "top",
						base: "main",
						type: "local",
						status: { merged: 0, open: 0, closed: 0, unpushed: 3 },
						createdAt: null,
					},
				],
				limit: 100,
				returned: 1,
				total: 1,
				truncated: false,
			},
		});
	});

	test("includes remote-only stacks and classifies PR status", () => {
		const result = reconcile(
			[],
			[
				remote({
					pullRequests: [
						{ number: 1, state: "closed", mergedAt: "2026-01-01T00:00:00.000Z", branch: "a" },
						{ number: 2, state: "open", mergedAt: null, branch: "b" },
						{ number: 3, state: "closed", mergedAt: null, branch: "c" },
					],
				}),
			],
		);
		expect(result.ok && result.value.stacks[0]).toMatchObject({
			type: "remote",
			branches: ["a", "b", "c"],
			status: { merged: 1, open: 1, closed: 1, unpushed: 0 },
		});
	});

	test("matches by number, enriches live fields, and remains local", () => {
		const result = reconcile(
			[
				local({
					id: "old-id",
					number: 42,
					base: "legacy",
					branches: [
						{ name: "a", pullRequest: { number: 10, merged: false } },
						{ name: "wip", pullRequest: null },
					],
				}),
			],
			[
				remote({
					id: "new-id",
					number: 42,
					base: "main",
					createdAt: "2026-02-01T00:00:00.000Z",
					pullRequests: [{ number: 10, state: "closed", mergedAt: null, branch: "a" }],
				}),
			],
		);
		expect(result.ok && result.value.stacks).toEqual([
			expect.objectContaining({
				number: 42,
				base: "main",
				type: "local",
				createdAt: "2026-02-01T00:00:00.000Z",
				status: { merged: 0, open: 0, closed: 1, unpushed: 1 },
			}),
		]);
	});

	test("matches by ID and backfills the stack number", () => {
		const result = reconcile(
			[local({ id: "55", branches: [{ name: "a", pullRequest: { number: 10, merged: false } }] })],
			[
				remote({
					id: "55",
					number: 99,
					pullRequests: [{ number: 10, state: "open", mergedAt: null, branch: "a" }],
				}),
			],
		);
		expect(result.ok && result.value.stacks[0]?.number).toBe(99);
	});

	test("number matching takes precedence over a conflicting ID match", () => {
		const result = reconcile(
			[
				local({
					id: "2",
					number: 10,
					branches: [{ name: "a", pullRequest: { number: 10, merged: false } }],
				}),
			],
			[
				remote({
					id: "1",
					number: 10,
					pullRequests: [{ number: 10, state: "open", mergedAt: null, branch: "a" }],
				}),
				remote({
					id: "2",
					number: 20,
					pullRequests: [{ number: 20, state: "open", mergedAt: null, branch: "other" }],
				}),
			],
		);
		expect(result.ok && result.value.stacks.map((stack) => stack.number)).toEqual([20, 10]);
	});

	test("omits fully merged rows but keeps closed unmerged rows", () => {
		const result = reconcile(
			[],
			[
				remote({
					id: "1",
					number: 1,
					pullRequests: [
						{ number: 1, state: "closed", mergedAt: "2026-01-01T00:00:00.000Z", branch: "merged" },
					],
				}),
				remote({
					id: "2",
					number: 2,
					pullRequests: [{ number: 2, state: "closed", mergedAt: null, branch: "closed" }],
				}),
			],
		);
		expect(result.ok && result.value.stacks.map((stack) => stack.number)).toEqual([2]);
	});

	test("sorts unnumbered first, then number descending, and applies limit afterward", () => {
		const result = reconcile(
			[local({ branches: [{ name: "wip", pullRequest: null }] })],
			[remote({ id: "1", number: 1 }), remote({ id: "2", number: 20 })],
			2,
		);
		expect(result).toMatchObject({
			ok: true,
			value: { limit: 2, returned: 2, total: 3, truncated: true },
		});
		expect(result.ok && result.value.stacks.map((stack) => stack.number)).toEqual([null, 20]);
	});

	test("uses branch summary as a deterministic tie breaker for unnumbered local stacks", () => {
		const result = reconcile(
			[
				local({ branches: [{ name: "z", pullRequest: null }] }),
				local({ branches: [{ name: "a", pullRequest: null }] }),
			],
			[],
		);
		expect(result.ok && result.value.stacks.map((stack) => stack.bottomBranch)).toEqual(["a", "z"]);
	});

	test.each([
		[
			"duplicate local IDs",
			[local({ id: "x" }), local({ id: "x", branches: [{ name: "b", pullRequest: null }] })],
			[],
			"duplicate local stack id: x",
		],
		[
			"duplicate remote IDs",
			[],
			[remote({ id: "x" }), remote({ id: "x", number: 2 })],
			"duplicate remote stack id: x",
		],
		[
			"duplicate remote numbers",
			[],
			[remote({ id: "x", number: 2 }), remote({ id: "y", number: 2 })],
			"duplicate remote stack number: 2",
		],
	] as const)("rejects %s", (_name, locals, remotes, detail) => {
		expect(reconcile(locals, remotes)).toEqual({ ok: false, detail });
	});

	test("rejects unsafe composition disagreement", () => {
		const result = reconcile(
			[
				local({
					id: "1",
					number: 1,
					branches: [{ name: "local", pullRequest: { number: 10, merged: false } }],
				}),
			],
			[
				remote({
					pullRequests: [{ number: 10, state: "open", mergedAt: null, branch: "renamed" }],
				}),
			],
		);
		expect(result).toEqual({
			ok: false,
			detail: "local and remote composition disagree for stack 1",
		});
	});
});
