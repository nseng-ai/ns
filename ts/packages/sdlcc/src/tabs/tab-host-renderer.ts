import { BoxRenderable, createCliRenderer, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";

import type { TabController } from "./tab-controller.ts";
import type { TabModuleDeps, TabViewport } from "./tab-module.ts";

// Border (top + bottom) + padding (top + bottom) + tab-bar line. Stack map ignored height in v1, so
// an approximate chrome budget is fine; modules that honor height get a sane floor.
const HOST_CHROME_ROWS = 5;

export interface StartTabHostTuiOptions {
	readonly controllers: readonly TabController[];
	readonly deps: TabModuleDeps;
}

interface MountedTabHostScreen {
	readonly tabBar: TextRenderable;
	readonly content: TextRenderable;
}

export async function startTabHostTui(options: StartTabHostTuiOptions): Promise<void> {
	const controllers = options.controllers;
	if (controllers.length === 0) throw new Error("startTabHostTui requires at least one tab controller.");

	let activeIndex = 0;
	let renderer: CliRenderer | undefined;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		const activeRenderer = renderer;
		const screen = mountTabHostScreen(activeRenderer);
		const reRender = (): void => {
			const active = controllers[activeIndex];
			if (active === undefined) return;
			screen.tabBar.content = renderTabBar(controllers, activeIndex);
			screen.content.content = active.render(viewportFor(activeRenderer)).join("\n");
			activeRenderer.requestRender();
		};

		// Preserve today's stack-map startup behavior: load the initially active tab before first paint.
		await controllers[activeIndex]?.ensureLoaded(options.deps);
		reRender();

		activeRenderer.keyInput.on("keypress", (key: KeyEvent) => {
			void handleHostKey({
				key,
				controllers,
				deps: options.deps,
				getActiveIndex: () => activeIndex,
				setActiveIndex: (index) => {
					activeIndex = index;
				},
				renderer: activeRenderer,
				reRender,
			});
		});

		const destroyed = new Promise<void>((resolve) => {
			activeRenderer.once("destroy", () => resolve());
		});
		activeRenderer.start();
		await destroyed;
	} catch (error) {
		if (renderer !== undefined && !renderer.isDestroyed) renderer.destroy();
		throw error;
	}
}

async function handleHostKey(options: {
	readonly key: KeyEvent;
	readonly controllers: readonly TabController[];
	readonly deps: TabModuleDeps;
	readonly getActiveIndex: () => number;
	readonly setActiveIndex: (index: number) => void;
	readonly renderer: CliRenderer;
	readonly reRender: () => void;
}): Promise<void> {
	const { key, controllers } = options;
	const activeIndex = options.getActiveIndex();
	const active = controllers[activeIndex];
	if (active === undefined) return;

	// Ctrl+C hard-exit is handled by createCliRenderer's exitOnCtrlC.
	if (!key.ctrl && !key.meta && key.name === "tab") {
		if (active.isBusy()) return;
		const delta = key.shift ? -1 : 1;
		const nextIndex = wrapIndex(activeIndex + delta, controllers.length);
		if (nextIndex === activeIndex) return;
		options.setActiveIndex(nextIndex);
		options.reRender();
		await controllers[nextIndex]?.ensureLoaded(options.deps);
		options.reRender();
		return;
	}

	const outcome = await active.handleKey(key, options.deps, options.reRender);
	if (outcome.type === "quit" && !options.renderer.isDestroyed) options.renderer.destroy();
}

function mountTabHostScreen(renderer: CliRenderer): MountedTabHostScreen {
	const root = new BoxRenderable(renderer, {
		id: "sdlcc-tab-host-root",
		width: "100%",
		height: "100%",
		flexDirection: "column",
		border: true,
		borderStyle: "rounded",
		borderColor: "#7aa2f7",
		backgroundColor: "#111827",
		padding: 1,
		title: "sdlcc",
		titleAlignment: "center",
	});

	// Fixed single-row tab bar that never shrinks, so it always occupies its own line above the content.
	const tabBar = new TextRenderable(renderer, {
		id: "sdlcc-tab-bar",
		content: "",
		fg: "#f9e2af",
		width: "100%",
		height: 1,
		flexShrink: 0,
	});

	// Fill the remaining column space below the tab bar via flex rather than height: "100%", which would
	// resolve to the full inner height and overlap the tab bar at row 0.
	const content = new TextRenderable(renderer, {
		id: "sdlcc-tab-content",
		content: "",
		fg: "#cdd6f4",
		width: "100%",
		flexGrow: 1,
		flexShrink: 1,
	});

	root.add(tabBar);
	root.add(content);
	renderer.root.add(root);
	renderer.requestRender();

	return { tabBar, content };
}

export function renderTabBar(controllers: readonly TabController[], activeIndex: number): string {
	return controllers.map((controller, index) => (index === activeIndex ? `[${controller.label}]` : ` ${controller.label} `)).join(" ");
}

function viewportFor(renderer: CliRenderer): TabViewport {
	return {
		width: renderer.terminalWidth,
		height: Math.max(1, renderer.terminalHeight - HOST_CHROME_ROWS),
	};
}

function wrapIndex(index: number, length: number): number {
	return ((index % length) + length) % length;
}
