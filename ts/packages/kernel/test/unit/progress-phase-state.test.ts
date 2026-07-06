import { describe, expect, test } from "vitest";

import { createProgressPhaseStateStore } from "@nseng-ai/kernel/progress-phase-state";

const PHASES = [
	{ key: "a", name: "Alpha", label: "alpha working…", detail: "alpha done" },
	{ key: "b", name: "Beta", label: "beta working…", detail: "beta done" },
	{ key: "c", name: "Gamma", label: "gamma working…", detail: "gamma done" },
] as const;

const SUBSTEP_PHASES = [
	{
		key: "checkpoint",
		name: "Checkpoint",
		label: "checkpointing…",
		detail: "checkpoint complete",
		substeps: [
			{ key: "inspect", name: "Inspect", label: "inspecting…", detail: "worktree inspected" },
			{ key: "generate", name: "Generate", label: "generating…", detail: "message ready" },
		],
	},
	{ key: "preflight", name: "Preflight", label: "checking…", detail: "ready" },
] as const;

describe("createProgressPhaseStateStore", () => {
	test("declares phases and tracks title updates", () => {
		const store = createProgressPhaseStateStore();

		expect(store.apply({ type: "phases-declared", title: "initial", phases: PHASES })).toEqual({
			type: "updated",
		});
		expect(store.title()).toBe("initial");
		expect(store.views().map((view) => [view.key, view.state, view.label])).toEqual([
			["a", "pending", "alpha working…"],
			["b", "pending", "beta working…"],
			["c", "pending", "gamma working…"],
		]);

		expect(store.apply({ type: "title-changed", title: "updated" })).toEqual({
			type: "updated",
		});
		expect(store.title()).toBe("updated");
	});

	test("ignores unknown phase keys by default", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		expect(store.apply({ type: "phase-started", phaseKey: "missing" })).toEqual({
			type: "ignored",
		});
		expect(store.views().map((view) => view.key)).toEqual(["a", "b", "c"]);
	});

	test("can append unknown phase keys for hosts that render forwarded arbitrary events", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES, unknownKeyPolicy: "append" });

		expect(store.apply({ type: "phase-started", phaseKey: "extra", label: "extra work" })).toEqual(
			expect.objectContaining({
				type: "updated",
				view: expect.objectContaining({ key: "extra", label: "extra work" }),
			}),
		);

		expect(store.views().map((view) => [view.key, view.name, view.state, view.label])).toEqual([
			["a", "Alpha", "done", "alpha working…"],
			["b", "Beta", "done", "beta working…"],
			["c", "Gamma", "done", "gamma working…"],
			["extra", "extra", "active", "extra work"],
		]);
	});

	test("starting a later phase marks earlier open phases done", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		store.apply({ type: "phase-started", phaseKey: "a" });
		store.apply({ type: "phase-started", phaseKey: "c" });

		expect(store.views().map((view) => [view.key, view.state, view.history])).toEqual([
			["a", "done", ["alpha working…"]],
			["b", "done", []],
			["c", "active", []],
		]);
	});

	test("progress starts a pending target and records superseded labels once", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		store.apply({ type: "phase-progress", phaseKey: "b", label: "same" });
		store.apply({ type: "phase-progress", phaseKey: "b", label: "same" });
		store.apply({ type: "phase-progress", phaseKey: "b", label: "next" });

		const [alpha, beta] = store.views();
		expect(alpha?.state).toBe("done");
		expect(beta).toMatchObject({
			state: "active",
			label: "next",
			history: ["beta working…", "same"],
		});
	});

	test("done and failed events settle the targeted phase", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		store.apply({ type: "phase-started", phaseKey: "a" });
		store.apply({ type: "phase-done", phaseKey: "a", detail: "explicit done" });
		store.apply({ type: "phase-failed", phaseKey: "b", detail: "boom" });

		expect(
			store.views().map((view) => [view.key, view.state, view.label, view.detail, view.history]),
		).toEqual([
			["a", "done", "explicit done", "explicit done", ["alpha working…"]],
			["b", "failed", "boom", "beta done", ["beta working…"]],
			["c", "pending", "gamma working…", "gamma done", []],
		]);
	});

	test("failActive marks the active phase failed and failures prevent open-phase settling", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		store.apply({ type: "phase-started", phaseKey: "b" });
		store.failActive();
		store.settleOpenPhases();

		expect(store.views().map((view) => [view.key, view.state])).toEqual([
			["a", "done"],
			["b", "failed"],
			["c", "pending"],
		]);
	});

	test("settleOpenPhases completes open phases when no failure is present", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });

		store.apply({ type: "phase-started", phaseKey: "a" });
		store.settleOpenPhases();

		expect(store.views().map((view) => [view.key, view.state])).toEqual([
			["a", "done"],
			["b", "done"],
			["c", "done"],
		]);
	});

	test("substep activation activates the parent and settles earlier siblings", () => {
		const store = createProgressPhaseStateStore({ phases: SUBSTEP_PHASES });

		store.apply({ type: "phase-started", phaseKey: "generate" });

		const [checkpoint] = store.views();
		expect(checkpoint).toMatchObject({ key: "checkpoint", state: "active" });
		expect(checkpoint?.substeps.map((view) => [view.key, view.state, view.label])).toEqual([
			["inspect", "done", "inspecting…"],
			["generate", "active", "generating…"],
		]);
	});

	test("completing a parent marks active substeps done and pending substeps skipped", () => {
		const store = createProgressPhaseStateStore({ phases: SUBSTEP_PHASES });

		store.apply({ type: "phase-started", phaseKey: "inspect" });
		store.apply({ type: "phase-done", phaseKey: "checkpoint" });

		const [checkpoint] = store.views();
		expect(checkpoint?.substeps.map((view) => [view.key, view.state])).toEqual([
			["inspect", "done"],
			["generate", "skipped"],
		]);
	});

	test("views are copy-safe", () => {
		const store = createProgressPhaseStateStore({ phases: PHASES });
		store.apply({ type: "phase-started", phaseKey: "a", label: "working" });
		store.apply({ type: "phase-progress", phaseKey: "a", label: "still working" });

		const view = store.views()[0];
		const history = view?.history as string[] | undefined;
		history?.push("mutated outside");

		expect(store.views()[0]?.history).toEqual(["alpha working…", "working"]);
	});
});
