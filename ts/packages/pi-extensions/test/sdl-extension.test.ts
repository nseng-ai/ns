import { describe, expect, test } from "vitest";

import sdlExtension from "../src/sdl-extension.ts";
import type { ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}
}

describe("sdl Pi extension", () => {
	test("exposes checkpoint command under the sdl namespace only", () => {
		const pi = new FakePi();

		sdlExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["sdl:cp"]);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("dev:cp")).toBe(false);
		expect(pi.commands.get("sdl:cp")?.description).toBe("sdl cp: Create a checkpoint commit for the current diff.");
	});
});
