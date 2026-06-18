import { focusCmuxSurface } from "./cmux-surface-focus.ts";
import { loadDashboardModel } from "./dashboard-model-loader.ts";
import {
	createInitialDashboardState,
	planDashboardActivation,
	reduceDashboardState,
	renderDashboardFrame,
	type DashboardAction,
	type DashboardModel,
	type DashboardState,
} from "./dashboard.ts";
import type { TabIntent, TabKeyInput, TabModule, TabModuleDeps } from "./tabs/tab-module.ts";

const DASHBOARD_REFRESH_MS = 3_000;
const DASHBOARD_COMMAND_TIMEOUT_MS = 10_000;

export type DashboardEffect = { readonly type: "activate-cmux" };

export type DashboardTabModule = TabModule<DashboardModel, DashboardState, DashboardAction, DashboardEffect>;

export const dashboardTabModule: DashboardTabModule = {
	id: "dashboard",
	label: "dashboard",
	refreshMs: DASHBOARD_REFRESH_MS,
	loadModel: (deps: TabModuleDeps): Promise<DashboardModel> => loadDashboardModel({ cwd: deps.cwd, runCommand: deps.runCommand }),
	createInitialState: createInitialDashboardState,
	refreshState: (previousModel, previousState, nextModel) => reduceDashboardState(previousModel, previousState, { type: "refresh", model: nextModel }),
	reduce: reduceDashboardState,
	render: renderDashboardFrame,
	interpretKey,
	runEffect,
};

function interpretKey(_state: DashboardState, key: TabKeyInput): TabIntent<DashboardAction, DashboardEffect> {
	if (key.ctrl || key.meta) return { type: "none" };
	const keyName = key.name ?? printableCharacterFromDashboardKey(key);
	switch (keyName) {
		case "up":
		case "k":
			return { type: "action", action: { type: "move-selection", delta: -1 } };
		case "down":
		case "j":
			return { type: "action", action: { type: "move-selection", delta: 1 } };
		case "r":
			return { type: "refresh" };
		case "enter":
		case "return":
			return { type: "effect", effect: { type: "activate-cmux" } };
		case "q":
		case "escape":
			return { type: "quit" };
		default:
			return { type: "none" };
	}
}

async function runEffect(model: DashboardModel, state: DashboardState, effect: DashboardEffect, deps: TabModuleDeps): Promise<DashboardState> {
	switch (effect.type) {
		case "activate-cmux":
			return await activateCmux(model, state, deps);
	}
}

async function activateCmux(model: DashboardModel, state: DashboardState, deps: TabModuleDeps): Promise<DashboardState> {
	const plan = planDashboardActivation(model, state);
	if (plan.type === "focus-surface") {
		const focusing = reduceDashboardState(model, state, { type: "set-status", message: "Focusing cmux surface…" });
		const result = await focusCmuxSurface({ cwd: deps.cwd, runCommand: deps.runCommand, target: plan.target, timeout: DASHBOARD_COMMAND_TIMEOUT_MS });
		const message = result.type === "focused" ? "Focused cmux surface." : result.message;
		return reduceDashboardState(model, focusing, { type: "set-status", message });
	}
	if (plan.type === "choose-surface") {
		return reduceDashboardState(model, state, { type: "set-status", message: `Multiple surfaces in this workspace; selected/focused surface was ambiguous (${plan.choices.length} choices).` });
	}
	return reduceDashboardState(model, state, { type: "set-status", message: plan.reason });
}

function printableCharacterFromDashboardKey(key: TabKeyInput): string | undefined {
	const sequence = key.sequence;
	if (sequence === undefined || [...sequence].length !== 1) return undefined;
	if (sequence < " " || sequence === "\x7F") return undefined;
	return sequence;
}
