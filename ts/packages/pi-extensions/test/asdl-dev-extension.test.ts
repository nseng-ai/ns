import { describe, expect, test } from "bun:test";

import asdlDevExtension from "../src/asdl-dev-extension.ts";
import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE, renderCliCommandOutputMessage, type ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, MessageRenderer>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: MessageRenderer): void {
		this.messageRenderers.set(customType, renderer);
	}
}

describe("asdl-dev Pi extension", () => {
	test("exposes asdl-dev command metadata under the dev namespace", () => {
		const pi = new FakePi();

		asdlDevExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["dev:preview-url", "dev:cp", "dev:submit"]);
		expect(pi.commands.has("asdl-dev:preview-url")).toBe(false);
		expect(pi.commands.has("asdl-dev:cp")).toBe(false);
		expect(pi.commands.has("asdl-dev:submit")).toBe(false);
		expect(pi.commands.has("dev:latest-branch-deployment")).toBe(false);
		expect(pi.commands.has("asdl-dev:latest-branch-deployment")).toBe(false);
		expect(pi.commands.get("dev:preview-url")?.description).toBe(
			"asdl-dev preview-url: Print the Vercel preview URL for a branch.",
		);
		expect(pi.commands.get("dev:cp")?.description).toBe("asdl-dev cp: Create a checkpoint commit for the current diff.");
		expect(pi.commands.get("dev:submit")?.description).toBe(
			"asdl-dev submit: Submit the current Graphite stack with gt submit -nps --ai.",
		);
		expect(pi.messageRenderers.get(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(renderCliCommandOutputMessage);
	});
});
