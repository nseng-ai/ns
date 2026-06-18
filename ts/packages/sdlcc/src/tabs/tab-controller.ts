import type { StyledText } from "@opentui/core";

import { styledLines } from "../frame-style.ts";
import type { TabKeyInput, TabModule, TabModuleDeps, TabViewport } from "./tab-module.ts";

export type TabKeyOutcome =
	| { readonly type: "quit" }
	| { readonly type: "handled" }
	| { readonly type: "ignored" };

export interface TabController {
	readonly id: string;
	readonly label: string;
	readonly refreshMs?: number | undefined;
	// Idempotent: loads the module model once and caches it plus the initial state.
	ensureLoaded(deps: TabModuleDeps): Promise<void>;
	// True while a runEffect or refresh is in flight; the host blocks tab switches while busy.
	isBusy(): boolean;
	// Renders the loading / error / loaded frame for the current lifecycle.
	render(viewport: TabViewport): StyledText;
	// Reloads the current module model and updates state through refreshState/createInitialState.
	refresh(deps: TabModuleDeps, onChange: () => void): Promise<void>;
	// Routes a key through interpretKey -> reduce / runEffect / refresh; onChange() re-renders.
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
	let isBusy = false;
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

	function render(viewport: TabViewport): StyledText {
		switch (lifecycle.type) {
			case "unloaded":
			case "loading":
				return styledLines([`Loading ${module.label}…`]);
			case "error":
				return styledLines([`Failed to load ${module.label}.`, lifecycle.message]);
			case "loaded":
				return module.render(lifecycle.model, lifecycle.state, viewport);
		}
	}

	async function refresh(deps: TabModuleDeps, onChange: () => void): Promise<void> {
		if (lifecycle.type !== "loaded") return;
		if (isBusy) return;
		const previousModel = lifecycle.model;
		const previousState = lifecycle.state;
		isBusy = true;
		try {
			const nextModel = await module.loadModel(deps);
			const nextState = module.refreshState?.(previousModel, previousState, nextModel) ?? module.createInitialState(nextModel);
			lifecycle = { type: "loaded", model: nextModel, state: nextState };
		} catch (error) {
			lifecycle = { type: "error", message: errorMessage(error) };
		} finally {
			isBusy = false;
		}
		onChange();
	}

	async function handleKey(key: TabKeyInput, deps: TabModuleDeps, onChange: () => void): Promise<TabKeyOutcome> {
		if (lifecycle.type !== "loaded") return { type: "ignored" };
		if (isBusy) return { type: "ignored" };

		const intent = module.interpretKey(lifecycle.state, key);
		switch (intent.type) {
			case "none":
				return { type: "ignored" };
			case "quit":
				return { type: "quit" };
			case "refresh":
				await refresh(deps, onChange);
				return { type: "handled" };
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
				isBusy = true;
				try {
					const next = await runEffect(lifecycle.model, lifecycle.state, intent.effect, deps);
					// lifecycle stays loaded across the await unless a programmer adds a future mutator; guard anyway.
					if (lifecycle.type === "loaded") lifecycle = { ...lifecycle, state: next };
				} finally {
					isBusy = false;
				}
				onChange();
				return { type: "handled" };
			}
		}
	}

	return {
		id: module.id,
		label: module.label,
		refreshMs: module.refreshMs,
		ensureLoaded,
		isBusy: () => isBusy,
		render,
		refresh,
		handleKey,
	};
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
