import { describe, expect, test } from "vitest";

import {
	gsAutobranchResultSchema,
	runGsAutobranch,
	type GsAutobranchContext,
	type GsAutobranchGitFacts,
	type GsAutobranchProviderView,
} from "../../src/core/autobranch.ts";

const dirty = { staged: 1, unstaged: 1, untracked: 1, total: 3 };
function facts(overrides: Partial<GsAutobranchGitFacts> = {}): GsAutobranchGitFacts {
	return {
		root: "/repo",
		providerWorktreeGitDir: "/repo/.git",
		branch: "main",
		headSha: "aaa",
		trunk: "main",
		trunkSha: "aaa",
		operation: "none",
		status: "M  a\0 M b\0?? c\0",
		diff: "diff",
		dirty,
		childSha: null,
		sourceRefSha: null,
		...overrides,
	};
}
function view(
	branches: GsAutobranchProviderView["branches"],
	currentBranch: string,
): GsAutobranchProviderView {
	return { trunk: "main", currentBranch, branches };
}

class Fixture {
	state: GsAutobranchGitFacts;
	providerView: GsAutobranchProviderView;
	readonly effects: string[] = [];
	readonly options: {
		readonly providerMutationFails?: boolean;
		readonly providerMutationApplies?: boolean;
		readonly viewFails?: boolean;
		readonly viewFailureReason?: "untracked" | "command-failed";
		readonly version?: string;
		readonly preparationFails?: boolean;
		readonly validation?: boolean;
		readonly createFails?: boolean;
		readonly checkpointFails?: boolean;
		readonly inspectFailsAt?: number;
	};
	private inspections = 0;
	constructor(state = facts(), options: Fixture["options"] = {}) {
		this.state = state;
		this.providerView = view([], state.branch ?? "main");
		this.options = options;
	}
	context(): GsAutobranchContext {
		return {
			git: {
				inspect: async () => {
					this.inspections += 1;
					return this.options.inspectFailsAt === this.inspections
						? { ok: false as const, message: "inspection failed" }
						: { ok: true as const, value: this.state };
				},
				validateChild: async () => ({ ok: true, value: this.options.validation ?? true }),
				createAndSwitchChild: async (child) => {
					this.effects.push(`switch:${child}`);
					if (this.options.createFails) return { ok: false, message: "switch failed" };
					this.state = {
						...this.state,
						branch: child,
						childSha: this.state.headSha,
						sourceRefSha: this.state.headSha,
					};
					return { ok: true, value: null };
				},
			},
			provider: {
				readVersion: async () => ({ ok: true, value: this.options.version ?? "0.1.0" }),
				view: async () =>
					this.options.viewFails
						? {
								ok: false,
								message: "provider view unavailable",
								reason: this.options.viewFailureReason ?? "untracked",
							}
						: { ok: true, value: this.providerView },
				init: async (child) => {
					this.effects.push(`init:${child}`);
					if (this.options.providerMutationApplies !== false)
						this.providerView = view([{ name: child, base: "main", isCurrent: true }], child);
					return this.options.providerMutationFails
						? { ok: false, message: "init exited nonzero" }
						: { ok: true, value: null };
				},
				add: async (child) => {
					this.effects.push(`add:${child}`);
					if (this.options.providerMutationApplies !== false) {
						const source = this.state.branch!;
						this.state = {
							...this.state,
							branch: child,
							childSha: this.state.headSha,
							sourceRefSha: this.state.headSha,
						};
						this.providerView = view(
							[
								{ name: source, base: "main", isCurrent: false },
								{ name: child, base: source, isCurrent: true },
							],
							child,
						);
					}
					return this.options.providerMutationFails
						? { ok: false, message: "add exited nonzero" }
						: { ok: true, value: null };
				},
			},
			checkpoint: {
				commit: async () => {
					this.effects.push("checkpoint");
					if (this.options.checkpointFails) return { ok: false, message: "checkpoint failed" };
					this.state = {
						...this.state,
						childSha: "bbb",
						headSha: "bbb",
						dirty: { staged: 0, unstaged: 0, untracked: 0, total: 0 },
					};
					return { ok: true, value: "bbb [cp] Test" };
				},
			},
			preparation: {
				prepare: async () =>
					this.options.preparationFails
						? { ok: false, message: "preparation failed" }
						: {
								ok: true,
								value: { child: "add-child", checkpointMessage: "[cp] Test\n\n- test" },
							},
			},
		};
	}
}
const interaction = {
	isInteractive: () => false,
	confirm: async () => ({ type: "cancelled" as const }),
};

describe("GS autobranch core", () => {
	test.each([
		["staged", { staged: 1, unstaged: 0, untracked: 0, total: 1 }],
		["unstaged", { staged: 0, unstaged: 1, untracked: 0, total: 1 }],
		["untracked", { staged: 0, unstaged: 0, untracked: 1, total: 1 }],
		["mixed", dirty],
	] as const)(
		"runs %s trunk bootstrap in exact checkpoint-before-init order",
		async (_name, pending) => {
			const fixture = new Fixture(facts({ dirty: pending }));
			const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
			expect(result.status).toBe("success");
			expect(fixture.effects).toEqual(["switch:add-child", "checkpoint", "init:add-child"]);
		},
	);

	test.each([
		["staged", { staged: 1, unstaged: 0, untracked: 0, total: 1 }],
		["unstaged", { staged: 0, unstaged: 1, untracked: 0, total: 1 }],
		["untracked", { staged: 0, unstaged: 0, untracked: 1, total: 1 }],
		["mixed", dirty],
	] as const)("runs %s tracked-top add before checkpoint", async (_name, pending) => {
		const fixture = new Fixture(facts({ branch: "feature", headSha: "aaa", dirty: pending }));
		fixture.providerView = view([{ name: "feature", base: "main", isCurrent: true }], "feature");
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("success");
		expect(fixture.effects).toEqual(["add:add-child", "checkpoint"]);
	});

	test.each([
		["clean", facts({ dirty: { staged: 0, unstaged: 0, untracked: 0, total: 0 } })],
		["detached", facts({ branch: null })],
		["operation", facts({ operation: "rebase" })],
		["missing trunk", facts({ trunk: null, trunkSha: null })],
	] as const)("refuses %s before mutation", async (_name, state) => {
		const fixture = new Fixture(state);
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("negative");
		expect(fixture.effects).toEqual([]);
	});

	test("refuses missing invoking-worktree membership without scanning peers", async () => {
		const fixture = new Fixture(facts({ branch: "feature" }), { viewFails: true });
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("negative");
		expect(fixture.effects).toEqual([]);
	});

	test.each(["trunk", "tracked-top"] as const)(
		"trusts observed %s postconditions after provider nonzero exit",
		async (path) => {
			const state = path === "trunk" ? facts() : facts({ branch: "feature" });
			const fixture = new Fixture(state, { providerMutationFails: true });
			if (path === "tracked-top") {
				fixture.providerView = view(
					[{ name: "feature", base: "main", isCurrent: true }],
					"feature",
				);
			}
			const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
			expect(result.status).toBe("success");
		},
	);

	test.each([
		["version mismatch", facts(), { version: "0.2.0" }],
		["missing HEAD", facts({ headSha: null }), {}],
		["invalid or existing child", facts(), { validation: false }],
	] as const)("refuses %s before mutation", async (_name, state, options) => {
		const fixture = new Fixture(state, options);
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("negative");
		expect(fixture.effects).toEqual([]);
	});

	test.each([
		["absent", view([], "feature")],
		[
			"duplicate",
			view(
				[
					{ name: "feature", base: "main", isCurrent: true },
					{ name: "feature", base: "main", isCurrent: false },
				],
				"feature",
			),
		],
		["not current", view([{ name: "feature", base: "main", isCurrent: false }], "other")],
		[
			"not top",
			view(
				[
					{ name: "feature", base: "main", isCurrent: true },
					{ name: "other", base: "feature", isCurrent: false },
				],
				"feature",
			),
		],
	] as const)("refuses tracked source that is %s", async (_name, providerView) => {
		const fixture = new Fixture(facts({ branch: "feature" }));
		fixture.providerView = providerView;
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("negative");
		expect(fixture.effects).toEqual([]);
	});

	test("reports arbitrary provider inspection failure as exit-2, not untracked", async () => {
		const fixture = new Fixture(facts({ branch: "feature" }), {
			viewFails: true,
			viewFailureReason: "command-failed",
		});
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result.status).toBe("failure");
		expect(fixture.effects).toEqual([]);
	});

	test("reports preparation and pre-mutation inspection failures as exit-2", async () => {
		for (const options of [{ preparationFails: true }, { inspectFailsAt: 1 }]) {
			const fixture = new Fixture(facts(), options);
			const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
			expect(result.status).toBe("failure");
			expect(fixture.effects).toEqual([]);
		}
	});

	test("classifies branch creation failure with observed absence as known partial", async () => {
		const fixture = new Fixture(facts(), { createFails: true });
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result).toMatchObject({
			status: "negative",
			data: { outcome: "known-partial-failure", childSha: null },
		});
	});

	test("reports the first unproved postcondition", async () => {
		const fixture = new Fixture(facts());
		const context = fixture.context();
		context.git.createAndSwitchChild = async (child) => {
			fixture.effects.push(`switch:${child}`);
			fixture.state = { ...fixture.state, branch: child, childSha: fixture.state.headSha };
			return { ok: true, value: null };
		};
		const result = await runGsAutobranch(context, interaction, { yes: true });
		expect(result).toMatchObject({
			status: "negative",
			data: {
				outcome: "known-partial-failure",
				diagnostic: "The source ref did not remain at the source HEAD.",
			},
		});
	});

	test.each(["trunk", "tracked-top"] as const)(
		"classifies %s checkpoint failure as known partial",
		async (path) => {
			const fixture = new Fixture(path === "trunk" ? facts() : facts({ branch: "feature" }), {
				checkpointFails: true,
			});
			if (path === "tracked-top")
				fixture.providerView = view(
					[{ name: "feature", base: "main", isCurrent: true }],
					"feature",
				);
			const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
			expect(result).toMatchObject({
				status: "negative",
				data: { outcome: "known-partial-failure" },
			});
		},
	);

	test.each(["trunk", "tracked-top"] as const)(
		"classifies %s absent provider postconditions as known partial",
		async (path) => {
			const fixture = new Fixture(path === "trunk" ? facts() : facts({ branch: "feature" }), {
				providerMutationFails: true,
				providerMutationApplies: false,
			});
			if (path === "tracked-top")
				fixture.providerView = view(
					[{ name: "feature", base: "main", isCurrent: true }],
					"feature",
				);
			const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
			expect(result).toMatchObject({
				status: "negative",
				data: { outcome: "known-partial-failure" },
			});
		},
	);

	test("classifies failed post-mutation inspection as ambiguous", async () => {
		const fixture = new Fixture(facts(), { inspectFailsAt: 2 });
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: true });
		expect(result).toMatchObject({
			status: "negative",
			data: { outcome: "ambiguous-failure" },
		});
	});

	test("bounds oversized diagnostics with the shared marker", async () => {
		const fixture = new Fixture(facts({ branch: "feature" }), {
			viewFails: true,
			viewFailureReason: "command-failed",
		});
		const context = fixture.context();
		context.provider.view = async () => ({
			ok: false,
			message: "x".repeat(2_000),
			reason: "command-failed",
		});
		const result = await runGsAutobranch(context, interaction, { yes: true });
		const data = gsAutobranchResultSchema.parse(result.data);
		expect(data.diagnostic).toHaveLength(1_100);
		expect(data.diagnostic).toMatch(/… \[diagnostic bound\]$/);
	});

	test("requires --yes for non-interactive mutation", async () => {
		const fixture = new Fixture();
		const result = await runGsAutobranch(fixture.context(), interaction, { yes: false });
		expect(result).toMatchObject({
			status: "usage-error",
			data: {
				recovery: { action: "authorize-mutation", instruction: "Rerun with --yes." },
			},
		});
		expect(fixture.effects).toEqual([]);
	});

	test("continues after interactive confirmation", async () => {
		const fixture = new Fixture();
		let prompt = "";
		const result = await runGsAutobranch(
			fixture.context(),
			{
				isInteractive: () => true,
				confirm: async (request) => {
					prompt = request.message;
					return { type: "confirmed" };
				},
			},
			{ yes: false },
		);
		expect(result.status).toBe("success");
		expect(prompt).toContain("Child: add-child");
		expect(fixture.effects).toEqual(["switch:add-child", "checkpoint", "init:add-child"]);
	});

	test.each(["declined", "cancelled"] as const)(
		"does not mutate after interactive confirmation is %s",
		async (type) => {
			const fixture = new Fixture();
			const result = await runGsAutobranch(
				fixture.context(),
				{ isInteractive: () => true, confirm: async () => ({ type }) },
				{ yes: false },
			);
			expect(result).toMatchObject({ status: "negative" });
			expect(fixture.effects).toEqual([]);
		},
	);
});
