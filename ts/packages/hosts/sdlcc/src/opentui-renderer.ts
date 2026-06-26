import {
	BoxRenderable,
	createCliRenderer,
	TextRenderable,
	type CliRenderer,
	type KeyEvent,
} from "@opentui/core";

import { buildHelloWorldModel, type SdlccHelloWorldModel } from "./hello-world.ts";

export interface StartHelloWorldTuiOptions {
	readonly model?: SdlccHelloWorldModel | undefined;
}

export async function startHelloWorldTui(options: StartHelloWorldTuiOptions = {}): Promise<void> {
	const model = options.model ?? buildHelloWorldModel();
	let renderer: CliRenderer | undefined;

	try {
		renderer = await createCliRenderer({ exitOnCtrlC: true });
		mountHelloWorldScreen(renderer, model);
		renderer.keyInput.on("keypress", (key: KeyEvent) => {
			if (key.name === "q" && !key.ctrl && !key.meta) {
				renderer?.destroy();
			}
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

function mountHelloWorldScreen(renderer: CliRenderer, model: SdlccHelloWorldModel): void {
	const root = new BoxRenderable(renderer, {
		id: "sdlcc-root",
		width: "100%",
		height: "100%",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 1,
		border: true,
		borderStyle: "rounded",
		borderColor: "#7aa2f7",
		backgroundColor: "#111827",
		padding: 2,
		title: "sdlcc",
		titleAlignment: "center",
	});

	root.add(
		new TextRenderable(renderer, { id: "sdlcc-title", content: model.title, fg: "#a6e3a1" }),
	);
	root.add(new TextRenderable(renderer, { id: "sdlcc-body", content: model.body, fg: "#cdd6f4" }));
	root.add(
		new TextRenderable(renderer, { id: "sdlcc-footer", content: model.footer, fg: "#f9e2af" }),
	);

	renderer.root.add(root);
	renderer.requestRender();
}
