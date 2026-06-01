import { describe, expect, test } from "bun:test";

import devExtension from "../src/dev.ts";

type RegisteredCommand = {
	description?: string;
	getArgumentCompletions?: (prefix: string) => unknown;
	handler(args: string, ctx: unknown): unknown;
};

class FakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}

	async exec(): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		throw new Error("unexpected exec during dev extension registration");
	}
}

describe("dev extension registration", () => {
	test("consolidates local development and source-control commands under dev without legacy aliases", () => {
		const pi = new FakePi();
		devExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["dev:cp", "dev:changes", "dev:autobranch", "dev:submit", "dev:land", "dev:land-stack"]);
		expect(pi.commands.has("cp")).toBe(false);
		expect(pi.commands.has("newbr")).toBe(false);
		expect(pi.commands.has("changes")).toBe(false);
		expect(pi.commands.has("summary")).toBe(false);
		expect(pi.commands.has("submit")).toBe(false);
		expect(pi.commands.has("gh:land")).toBe(false);
		expect(pi.commands.has("gt:land-stack")).toBe(false);
		expect(pi.commands.has("land")).toBe(false);
		expect(pi.commands.has("land-stack")).toBe(false);
		expect(pi.commands.get("dev:changes")?.description).toContain("without committing");
		expect(pi.commands.get("dev:autobranch")?.description).toContain("generating the branch name and checkpoint commit message");
		expect(pi.messageRenderers.has("dev-changes-summary")).toBe(true);
		expect(pi.messageRenderers.has("land-stack-command-stream")).toBe(true);
	});
});
