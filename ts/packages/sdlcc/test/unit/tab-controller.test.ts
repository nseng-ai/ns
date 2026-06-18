import { describe, expect, test } from "vitest";

import { createTabController } from "../../src/tabs/tab-controller.ts";
import type { TabIntent, TabModule, TabModuleDeps } from "../../src/tabs/tab-module.ts";

interface FakeModel {
	readonly label: string;
}

interface FakeState {
	readonly count: number;
}

type FakeAction = { readonly type: "increment" };
type FakeEffect = { readonly type: "bump"; readonly by: number };

const DEPS: TabModuleDeps = {
	cwd: "/repo",
	env: {},
	runCommand: async () => ({ code: 0, stdout: "", stderr: "", killed: false }),
};

interface FakeModuleOptions {
	readonly loadModel?: (deps: TabModuleDeps) => Promise<FakeModel>;
	readonly interpretKey?: (state: FakeState, key: { readonly name?: string | undefined }) => TabIntent<FakeAction, FakeEffect>;
	readonly runEffect?: ((model: FakeModel, state: FakeState, effect: FakeEffect) => Promise<FakeState>) | undefined;
	readonly omitRunEffect?: boolean;
}

function createFakeModule(options: FakeModuleOptions = {}): TabModule<FakeModel, FakeState, FakeAction, FakeEffect> {
	const base: TabModule<FakeModel, FakeState, FakeAction, FakeEffect> = {
		id: "fake",
		label: "fake",
		loadModel: options.loadModel ?? (async () => ({ label: "loaded" })),
		createInitialState: () => ({ count: 0 }),
		reduce: (_model, state, action) => (action.type === "increment" ? { count: state.count + 1 } : state),
		render: (model, state) => [`${model.label}:${state.count}`],
		interpretKey: options.interpretKey ?? (() => ({ type: "none" })),
		runEffect: options.runEffect ?? (async (_model, state, effect) => ({ count: state.count + effect.by })),
	};
	if (options.omitRunEffect) {
		const { runEffect: _drop, ...rest } = base;
		return rest;
	}
	return base;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe("createTabController lifecycle", () => {
	test("renders a loading frame until the model resolves, then the loaded frame", async () => {
		const load = deferred<FakeModel>();
		const controller = createTabController(createFakeModule({ loadModel: () => load.promise }));

		expect(controller.render()).toEqual(["Loading fake…"]);

		const loaded = controller.ensureLoaded(DEPS);
		expect(controller.render()).toEqual(["Loading fake…"]);

		load.resolve({ label: "ready" });
		await loaded;
		expect(controller.render()).toEqual(["ready:0"]);
	});

	test("renders an error frame when loadModel throws", async () => {
		const controller = createTabController(createFakeModule({ loadModel: async () => { throw new Error("boom"); } }));

		await controller.ensureLoaded(DEPS);
		expect(controller.render()).toEqual(["Failed to load fake.", "boom"]);
	});

	test("ensureLoaded is idempotent and loads only once", async () => {
		let loadCount = 0;
		const controller = createTabController(createFakeModule({
			loadModel: async () => {
				loadCount += 1;
				return { label: "ready" };
			},
		}));

		await Promise.all([controller.ensureLoaded(DEPS), controller.ensureLoaded(DEPS)]);
		await controller.ensureLoaded(DEPS);
		expect(loadCount).toBe(1);
	});
});

describe("createTabController routing", () => {
	test("ignores keys before the model is loaded", async () => {
		const controller = createTabController(createFakeModule({ interpretKey: () => ({ type: "action", action: { type: "increment" } }) }));

		const outcome = await controller.handleKey({ name: "x" }, DEPS, () => {});
		expect(outcome).toEqual({ type: "ignored" });
	});

	test("reduces actions and re-renders on change", async () => {
		let changes = 0;
		const controller = createTabController(createFakeModule({ interpretKey: () => ({ type: "action", action: { type: "increment" } }) }));
		await controller.ensureLoaded(DEPS);

		const outcome = await controller.handleKey({ name: "x" }, DEPS, () => { changes += 1; });
		expect(outcome).toEqual({ type: "handled" });
		expect(changes).toBe(1);
		expect(controller.render()).toEqual(["loaded:1"]);
	});

	test("does not re-render when reduce returns the same state", async () => {
		let changes = 0;
		const controller = createTabController(createFakeModule({ interpretKey: () => ({ type: "none" }) }));
		await controller.ensureLoaded(DEPS);

		const outcome = await controller.handleKey({ name: "x" }, DEPS, () => { changes += 1; });
		expect(outcome).toEqual({ type: "ignored" });
		expect(changes).toBe(0);
	});

	test("returns quit for a quit intent without destroying state", async () => {
		const controller = createTabController(createFakeModule({ interpretKey: () => ({ type: "quit" }) }));
		await controller.ensureLoaded(DEPS);

		expect(await controller.handleKey({ name: "q" }, DEPS, () => {})).toEqual({ type: "quit" });
	});

	test("runs effects, applies the new state, and clears busy afterward", async () => {
		const controller = createTabController(createFakeModule({ interpretKey: () => ({ type: "effect", effect: { type: "bump", by: 5 } }) }));
		await controller.ensureLoaded(DEPS);

		const outcome = await controller.handleKey({ name: "e" }, DEPS, () => {});
		expect(outcome).toEqual({ type: "handled" });
		expect(controller.isBusy()).toBe(false);
		expect(controller.render()).toEqual(["loaded:5"]);
	});

	test("busy guard blocks concurrent keys while an effect is in flight", async () => {
		const effect = deferred<FakeState>();
		const controller = createTabController(createFakeModule({
			interpretKey: () => ({ type: "effect", effect: { type: "bump", by: 1 } }),
			runEffect: () => effect.promise,
		}));
		await controller.ensureLoaded(DEPS);

		const inFlight = controller.handleKey({ name: "e" }, DEPS, () => {});
		expect(controller.isBusy()).toBe(true);

		const blocked = await controller.handleKey({ name: "e" }, DEPS, () => {});
		expect(blocked).toEqual({ type: "ignored" });

		effect.resolve({ count: 9 });
		expect(await inFlight).toEqual({ type: "handled" });
		expect(controller.isBusy()).toBe(false);
		expect(controller.render()).toEqual(["loaded:9"]);
	});

	test("ignores effect intents when the module has no runEffect", async () => {
		const controller = createTabController(createFakeModule({
			interpretKey: () => ({ type: "effect", effect: { type: "bump", by: 1 } }),
			omitRunEffect: true,
		}));
		await controller.ensureLoaded(DEPS);

		expect(await controller.handleKey({ name: "e" }, DEPS, () => {})).toEqual({ type: "ignored" });
	});
});
