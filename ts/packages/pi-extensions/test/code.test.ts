import { describe, expect, test } from "vitest";

import codeExtension from "../src/code.ts";

interface RegisteredCommand {
	description?: string;
	getArgumentCompletions?: (prefix: string) => unknown;
	handler(args: string, ctx: unknown): unknown;
}

class FakePi {
	readonly commandNames: string[] = [];
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly events: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		if (this.commands.has(name)) {
			throw new Error(`duplicate command registration: ${name}`);
		}
		this.commandNames.push(name);
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		this.messageRenderers.set(customType, renderer);
	}

	on(event: string): void {
		this.events.push(event);
	}

	async exec(): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		throw new Error("unexpected exec during code extension registration");
	}
}

describe("code extension registration", () => {
	test("keeps only review-feedback watch under code after SDL code-lifecycle cutover", () => {
		const pi = new FakePi();
		codeExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["code:pr-feedback-watch"]);
		expect(pi.commands.has("code:pr-regen")).toBe(false);
		expect(pi.commands.has("code:push")).toBe(false);
		expect(pi.commands.has("code:autobranch")).toBe(false);
		expect(pi.commands.has("code:autoslot")).toBe(false);
		expect(pi.commands.has("code:land")).toBe(false);
		expect(pi.commands.has("code:land-stack")).toBe(false);
		expect(pi.commands.has("code:changes")).toBe(false);
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.has("code:submit")).toBe(false);
		expect(pi.commands.get("code:pr-feedback-watch")?.description).toContain("current branch PR");
	});
});
