import { describe, expect, test } from "vitest";

import autobranchExtension from "../src/autobranch.ts";
import type { ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
}

describe("autobranch Pi extension", () => {
	test("registers the ccc autobranch command under the code namespace", () => {
		const pi = new FakePi();

		autobranchExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["code:autobranch"]);
		expect(pi.commands.has("ccc:autobranch")).toBe(false);
		expect(pi.commands.get("code:autobranch")?.description).toBe(
			"ccc autobranch: Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
		);
	});
});
