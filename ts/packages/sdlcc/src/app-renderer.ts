import { BoxRenderable, createCliRenderer, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";

import { runRealCommand } from "./command-runner.ts";
import { loadDashboardModel } from "./dashboard-model-loader.ts";
import { createInitialDashboardState, planDashboardActivation, reduceDashboardState, renderDashboardFrame, type DashboardActivationTarget, type DashboardModel, type DashboardState } from "./dashboard.ts";
import { loadStackMapModel } from "./stack-map-model-loader.ts";
import { reduceStackMapState, renderStackMapFrame } from "./stack-map.ts";
import { createInitialStackMapState, type StackMapState } from "./stack-map.ts";

export interface StartAppShellOptions {
	readonly dashboardModel?: DashboardModel | undefined;
	readonly stackMapState?: StackMapState | undefined;
	readonly activationExecutor?: DashboardActivationExecutor | undefined;
}

export interface DashboardActivationExecutor {
	focusSurface(target: DashboardActivationTarget): Promise<{ readonly type: "focused" } | { readonly type: "failed"; readonly message: string }>;
}

interface AppKeyInput {
	readonly name?: string | undefined;
	readonly sequence?: string | undefined;
	readonly ctrl?: boolean | undefined;
	readonly meta?: boolean | undefined;
	readonly shift?: boolean | undefined;
}

type AppKeyIntent =
	| { readonly type: "none" }
	| { readonly type: "quit" }
	| { readonly type: "dashboard" }
	| { readonly type: "stack-map" }
	| { readonly type: "refresh" }
	| { readonly type: "move-selection"; readonly delta: number }
	| { readonly type: "activate" }
	| { readonly type: "toggle-scope" }
	| { readonly type: "start-query" };

export async function startDefaultApp(): Promise<void> {
	const [stackMapModel, dashboardModel] = await Promise.all([loadStackMapModel(), loadDashboardModel()]);
	await startAppShell({ dashboardModel, stackMapState: createInitialStackMapState(stackMapModel) });
}

export async function startAppShell(options: StartAppShellOptions): Promise<void> {
	let dashboardModel = options.dashboardModel ?? (await loadDashboardModel());
	const stackMapModel = await loadStackMapModel();
	let stackMapState = options.stackMapState ?? createInitialStackMapState(stackMapModel);
	const activationExecutor = options.activationExecutor ?? createDashboardActivationExecutor();
	let activeTab: "dashboard" | "stack-map" = "dashboard";
	let dashboardState = createInitialDashboardState(dashboardModel);
	let renderer: CliRenderer | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let isShuttingDown = false;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		const root = new BoxRenderable(renderer, { id: "sdlcc-app-root", width: "100%", height: "100%", flexDirection: "column", border: true, borderStyle: "rounded", padding: 1, title: "sdlcc", titleAlignment: "center" });
		const frame = new TextRenderable(renderer, { id: "sdlcc-app-frame", content: renderAppFrame(activeTab, dashboardModel, dashboardState, stackMapModel, stackMapState), width: "100%", height: "100%" });
		root.add(frame);
		renderer.root.add(root);
		const rerender = (): void => {
			if (isShuttingDown || renderer === undefined || renderer.isDestroyed) return;
			frame.content = renderAppFrame(activeTab, dashboardModel, dashboardState, stackMapModel, stackMapState);
			renderer.requestRender();
		};
		renderer.keyInput.on("keypress", (key: KeyEvent) => {
			void handleAppKey({ key, activeTab, setActiveTab: (tab) => { activeTab = tab; }, dashboardModel, getDashboardState: () => dashboardState, setDashboardState: (state) => { dashboardState = state; }, stackMapModel, getStackMapState: () => stackMapState, setStackMapState: (state) => { stackMapState = state; }, activationExecutor, quit: () => { isShuttingDown = true; renderer?.destroy(); }, rerender });
		});
		refreshTimer = setInterval(() => { void loadDashboardModel().then((next) => { if (isShuttingDown) return; dashboardState = reduceDashboardState(dashboardModel, dashboardState, { type: "refresh", model: next }); dashboardModel = next; rerender(); }); }, 3000);
		renderer.start();
		await new Promise<void>((resolve) => renderer?.once("destroy", () => resolve()));
	} finally {
		isShuttingDown = true;
		if (refreshTimer !== undefined) clearInterval(refreshTimer);
		if (renderer !== undefined && !renderer.isDestroyed) renderer.destroy();
	}
}

async function handleAppKey(options: {
	readonly key: KeyEvent;
	readonly activeTab: "dashboard" | "stack-map";
	readonly setActiveTab: (tab: "dashboard" | "stack-map") => void;
	readonly dashboardModel: DashboardModel;
	readonly getDashboardState: () => DashboardState;
	readonly setDashboardState: (state: DashboardState) => void;
	readonly stackMapModel: Awaited<ReturnType<typeof loadStackMapModel>>;
	readonly getStackMapState: () => StackMapState;
	readonly setStackMapState: (state: StackMapState) => void;
	readonly activationExecutor: DashboardActivationExecutor;
	readonly quit: () => void;
	readonly rerender: () => void;
}): Promise<void> {
	const intent = interpretAppKey(options.key);
	if (intent.type === "none") return;
	if (intent.type === "quit") {
		options.quit();
		return;
	}
	if (intent.type === "dashboard" || intent.type === "stack-map") {
		options.setActiveTab(intent.type);
		options.rerender();
		return;
	}
	if (intent.type === "refresh") {
		options.setDashboardState(reduceDashboardState(options.dashboardModel, options.getDashboardState(), { type: "refresh", model: options.dashboardModel }));
		options.rerender();
		return;
	}
	if (options.activeTab === "dashboard") {
		await handleDashboardKeyIntent(options, intent);
		options.rerender();
		return;
	}
	handleStackMapKeyIntent(options, intent);
	options.rerender();
}

async function handleDashboardKeyIntent(options: {
	readonly dashboardModel: DashboardModel;
	readonly getDashboardState: () => DashboardState;
	readonly setDashboardState: (state: DashboardState) => void;
	readonly activationExecutor: DashboardActivationExecutor;
}, intent: AppKeyIntent): Promise<void> {
	if (intent.type === "move-selection") {
		options.setDashboardState(reduceDashboardState(options.dashboardModel, options.getDashboardState(), { type: "move-selection", delta: intent.delta }));
		return;
	}
	if (intent.type !== "activate") return;
	const state = options.getDashboardState();
	const plan = planDashboardActivation(options.dashboardModel, state);
	if (plan.type === "focus-surface") {
		options.setDashboardState(reduceDashboardState(options.dashboardModel, state, { type: "set-status", message: "Focusing cmux surface…" }));
		const result = await options.activationExecutor.focusSurface(plan.target);
		options.setDashboardState(reduceDashboardState(options.dashboardModel, options.getDashboardState(), { type: "set-status", message: result.type === "focused" ? "Focused cmux surface." : result.message }));
		return;
	}
	if (plan.type === "choose-surface") {
		options.setDashboardState(reduceDashboardState(options.dashboardModel, state, { type: "set-status", message: `Multiple surfaces in this workspace; selected/focused surface was ambiguous (${plan.choices.length} choices).` }));
		return;
	}
	options.setDashboardState(reduceDashboardState(options.dashboardModel, state, { type: "set-status", message: plan.reason }));
}

function handleStackMapKeyIntent(options: {
	readonly stackMapModel: Awaited<ReturnType<typeof loadStackMapModel>>;
	readonly getStackMapState: () => StackMapState;
	readonly setStackMapState: (state: StackMapState) => void;
}, intent: AppKeyIntent): void {
	const state = options.getStackMapState();
	if (intent.type === "move-selection") {
		options.setStackMapState(reduceStackMapState(options.stackMapModel, state, { type: "move-selection", delta: intent.delta }));
		return;
	}
	if (intent.type === "toggle-scope") {
		options.setStackMapState(reduceStackMapState(options.stackMapModel, state, { type: "toggle-scope" }));
		return;
	}
	if (intent.type === "start-query") {
		options.setStackMapState(reduceStackMapState(options.stackMapModel, state, { type: "start-query" }));
		return;
	}
	if (intent.type === "activate") options.setStackMapState(reduceStackMapState(options.stackMapModel, state, { type: "set-status", message: "Use the direct stack-map screen for cmux activation: sdlcc stack-map." }));
}

export function interpretAppKey(key: AppKeyInput): AppKeyIntent {
	if (key.ctrl || key.meta) return { type: "none" };
	const keyName = key.name ?? printableCharacterFromAppKey(key);
	if (keyName === "tab") return key.shift ? { type: "dashboard" } : { type: "stack-map" };
	if (keyName === "1") return { type: "dashboard" };
	if (keyName === "2") return { type: "stack-map" };
	if (keyName === "q" || keyName === "escape") return { type: "quit" };
	if (keyName === "r") return { type: "refresh" };
	if (keyName === "up" || keyName === "k") return { type: "move-selection", delta: -1 };
	if (keyName === "down" || keyName === "j") return { type: "move-selection", delta: 1 };
	if (keyName === "enter" || keyName === "return") return { type: "activate" };
	if (keyName === "o") return { type: "toggle-scope" };
	if (keyName === "/") return { type: "start-query" };
	return { type: "none" };
}

function printableCharacterFromAppKey(key: AppKeyInput): string | undefined {
	const sequence = key.sequence;
	if (sequence === undefined || [...sequence].length !== 1) return undefined;
	if (sequence < " " || sequence === "\x7F") return undefined;
	return sequence;
}

function createDashboardActivationExecutor(): DashboardActivationExecutor {
	return {
		async focusSurface(target) {
			const params = JSON.stringify({ surface_id: target.surfaceRef, workspace_id: target.workspaceRef, window_id: target.windowRef });
			const result = await runRealCommand("cmux", ["rpc", "surface.focus", params], { cwd: process.cwd(), timeout: 10_000 });
			if (result.code === 0) return { type: "focused" };
			return { type: "failed", message: `cmux rpc surface.focus failed with exit code ${result.code}. stdout: ${result.stdout.trim() || "(empty)"} stderr: ${result.stderr.trim() || "(empty)"}` };
		},
	};
}

function renderAppFrame(activeTab: "dashboard" | "stack-map", dashboardModel: DashboardModel, dashboardState: DashboardState, stackMapModel: Awaited<ReturnType<typeof loadStackMapModel>>, stackMapState: StackMapState): string {
	return [`Tabs: [${activeTab === "dashboard" ? "*" : " "}] Dashboard  [${activeTab === "stack-map" ? "*" : " "}] Stack Map`, "", activeTab === "dashboard" ? renderDashboardFrame(dashboardModel, dashboardState) : renderStackMapFrame(stackMapModel, stackMapState)].join("\n");
}
