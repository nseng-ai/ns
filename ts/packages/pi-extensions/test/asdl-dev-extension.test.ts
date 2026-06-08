import { describe, expect, test } from "vitest";

import asdlDevExtension from "../src/asdl-dev-extension.ts";
import type { ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
}

describe("asdl-dev Pi extension", () => {
	test("exposes only non-code asdl-dev command metadata under the dev namespace", () => {
		const pi = new FakePi();

		asdlDevExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["dev:preview-url"]);
		expect(pi.commands.has("asdl-dev:preview-url")).toBe(false);
		expect(pi.commands.has("asdl-dev:cp")).toBe(false);
		expect(pi.commands.has("asdl-dev:submit")).toBe(false);
		expect(pi.commands.has("dev:cp")).toBe(false);
		expect(pi.commands.has("dev:submit")).toBe(false);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("code:submit")).toBe(false);
		expect(pi.commands.has("dev:latest-branch-deployment")).toBe(false);
		expect(pi.commands.has("asdl-dev:latest-branch-deployment")).toBe(false);
		expect(pi.commands.get("dev:preview-url")?.description).toBe(
			"asdl-dev preview-url: Print the Vercel preview URL for a branch.",
		);
	});
});
