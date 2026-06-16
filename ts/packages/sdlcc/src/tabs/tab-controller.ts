import type { TabKeyInput, TabModule, TabModuleDeps, TabViewport } from "./tab-module.ts";

export type TabKeyOutcome =
	| { readonly type: "quit" }
	| { readonly type: "handled" }
	| { readonly type: "ignored" };

export interface TabController {
	readonly id: string;
	readonly label: string;
	// Idempotent: loads the module model once and caches it plus the initial state.
	ensureLoaded(deps: TabModuleDeps): Promise<void>;
	// True while a runEffect is in flight; the host blocks tab switches while busy.
	isBusy(): boolean;
	// Renders the loading / error / loaded frame for the current lifecycle.
	render(viewport: TabViewport): readonly string[];
	// Routes a key through interpretKey -> reduce / runEffect; onChange() re-renders.
	handleKey(key: TabKeyInput, deps: TabModuleDeps, onChange: () => void): Promise<TabKeyOutcome>;
}

type TabLifecycle<Model, State> =
	| { readonly type: "unloaded" }
	| { readonly type: "loading" }
	| { readonly type: "loaded"; readonly model: Model; readonly state: State }
	| { readonly type: "error"; readonly message: string };

export function createTabController<Model, State, Action, Effect>(
	module: TabModule<Model, State, Action, Effect>,
): TabController {
	let lifecycle: TabLifecycle<Model, State> = { type: "unloaded" };
	let busy = false;
	let loadPromise: Promise<void> | undefined;

	async function ensureLoaded(deps: TabModuleDeps): Promise<void> {
		if (lifecycle.type === "loaded" || lifecycle.type === "error") return;
		if (loadPromise !== undefined) return loadPromise;
		lifecycle = { type: "loading" };
		loadPromise = (async () => {
			try {
				const model = await module.loadModel(deps);
				lifecycle = { type: "loaded", model, state: module.createInitialState(model) };
			} catch (error) {
				lifecycle = { type: "error", message: errorMessage(error) };
			} finally {
				loadPromise = undefined;
			}
		})();
		return loadPromise;
	}

	function render(viewport: TabViewport): readonly string[] {
		switch (lifecycle.type) {
			case "unloaded":
			case "loading":
				return [`Loading ${module.label}…`];
			case "error":
				return [`Failed to load ${module.label}.`, lifecycle.message];
			case "loaded":
				return module.render(lifecycle.model, lifecycle.state, viewport);
		}
	}

	async function handleKey(key: TabKeyInput, deps: TabModuleDeps, onChange: () => void): Promise<TabKeyOutcome> {
		if (lifecycle.type !== "loaded") return { type: "ignored" };
		if (busy) return { type: "ignored" };

		const intent = module.interpretKey(lifecycle.state, key);
		switch (intent.type) {
			case "none":
				return { type: "ignored" };
			case "quit":
				return { type: "quit" };
			case "action": {
				const next = module.reduce(lifecycle.model, lifecycle.state, intent.action);
				if (next !== lifecycle.state) {
					lifecycle = { ...lifecycle, state: next };
					onChange();
				}
				return { type: "handled" };
			}
			case "effect": {
				const runEffect = module.runEffect;
				if (runEffect === undefined) return { type: "ignored" };
				busy = true;
				try {
					const next = await runEffect(lifecycle.model, lifecycle.state, intent.effect, deps);
					// lifecycle stays loaded across the await (only ensureLoaded mutates it, and it is idempotent once loaded).
					if (lifecycle.type === "loaded") lifecycle = { ...lifecycle, state: next };
				} finally {
					busy = false;
				}
				onChange();
				return { type: "handled" };
			}
		}
	}

	return {
		id: module.id,
		label: module.label,
		ensureLoaded,
		isBusy: () => busy,
		render,
		handleKey,
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
