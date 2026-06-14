import { BoxRenderable, createCliRenderer, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";

import {
	buildStackMapPrototypeModel,
	createInitialStackMapState,
	reduceStackMapPrototypeState,
	renderStackMapPrototypeFrame,
	type StackMapPrototypeModel,
	type StackMapPrototypeState,
} from "./stack-map-prototype.ts";

export interface StartStackMapPrototypeTuiOptions {
	readonly model?: StackMapPrototypeModel | undefined;
}

interface MountedStackMapPrototypeScreen {
	readonly frame: TextRenderable;
}

export async function startStackMapPrototypeTui(options: StartStackMapPrototypeTuiOptions = {}): Promise<void> {
	const model = options.model ?? buildStackMapPrototypeModel();
	let state = createInitialStackMapState(model);
	let renderer: CliRenderer | undefined;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		const screen = mountStackMapPrototypeScreen(renderer, model, state);
		renderer.keyInput.on("keypress", (key: KeyEvent) => {
			if (shouldQuit(key)) {
				renderer?.destroy();
				return;
			}

			const nextState = reduceFromKey(model, state, key);
			if (nextState === state) return;

			state = nextState;
			screen.frame.content = renderStackMapPrototypeFrame(model, state);
			renderer?.requestRender();
		});

		const destroyed = new Promise<void>((resolve) => {
			renderer?.once("destroy", () => resolve());
		});
		renderer.start();
		await destroyed;
	} catch (error) {
		if (renderer !== undefined && !renderer.isDestroyed) {
			renderer.destroy();
		}
		throw error;
	}
}

function mountStackMapPrototypeScreen(
	renderer: CliRenderer,
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
): MountedStackMapPrototypeScreen {
	const root = new BoxRenderable(renderer, {
		id: "sdlcc-stack-map-root",
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

	const frame = new TextRenderable(renderer, {
		id: "sdlcc-stack-map-frame",
		content: renderStackMapPrototypeFrame(model, state),
		fg: "#cdd6f4",
		width: "100%",
		height: "100%",
	});

	root.add(frame);
	renderer.root.add(root);
	renderer.requestRender();

	return { frame };
}

function reduceFromKey(
	model: StackMapPrototypeModel,
	state: StackMapPrototypeState,
	key: KeyEvent,
): StackMapPrototypeState {
	if (key.ctrl || key.meta) return state;

	switch (key.name) {
		case "up":
		case "k":
			return reduceStackMapPrototypeState(model, state, { type: "move-selection", delta: -1 });
		case "down":
		case "j":
			return reduceStackMapPrototypeState(model, state, { type: "move-selection", delta: 1 });
		case "o":
			return reduceStackMapPrototypeState(model, state, { type: "toggle-filter" });
		case "?":
			return reduceStackMapPrototypeState(model, state, { type: "toggle-question" });
		default:
			return state;
	}
}

function shouldQuit(key: KeyEvent): boolean {
	if (key.name === "escape") return true;
	return key.name === "q" && !key.ctrl && !key.meta;
}
