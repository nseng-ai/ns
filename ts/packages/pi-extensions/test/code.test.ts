import { describe, expect, test } from "vitest";

import asdlDevExtension from "../src/asdl-dev-extension.ts";
import { CLI_COMMAND_OUTPUT_MESSAGE_TYPE } from "../src/cli-command-extension.ts";
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
	test("consolidates codebase and source-control commands under code without legacy aliases", () => {
		const pi = new FakePi();
		codeExtension(pi);

		expect([...pi.commands.keys()]).toEqual([
			"code:changes",
			"code:submit",
			"code:pr-regen",
			"code:push",
			"code:autobranch",
			"code:autoslot",
			"code:land",
			"code:pr-feedback-watch",
		]);
		expect(pi.commands.has("cp")).toBe(false);
		expect(pi.commands.has("autobranch")).toBe(false);
		expect(pi.commands.has("autoslot")).toBe(false);
		expect(pi.commands.has("changes")).toBe(false);
		expect(pi.commands.has("summary")).toBe(false);
		expect(pi.commands.has("submit")).toBe(false);
		expect(pi.commands.has("push")).toBe(false);
		expect(pi.commands.has("gh:land")).toBe(false);
		expect(pi.commands.has("gt:land-stack")).toBe(false);
		expect(pi.commands.has("code:land-stack")).toBe(false);
		expect(pi.commands.has("land")).toBe(false);
		expect(pi.commands.has("land-stack")).toBe(false);
		const oldCommandPrefix = "dev";
		for (const command of ["cp", "changes", "autobranch", "submit", "push", "pr-regen", "land", "land-stack"]) {
			expect(pi.commands.has(`${oldCommandPrefix}:${command}`)).toBe(false);
		}
		expect(pi.commands.get("code:changes")?.description).toContain("without committing");
		expect(pi.commands.has("code:cp")).toBe(false);
		expect(pi.commands.get("code:submit")?.description).toBe(
			"asdl-dev submit: Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai --no-interactive.",
		);
		expect(pi.commands.get("code:pr-regen")?.description).toBe(
			"asdl-dev pr-regen: Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
		);
		expect(pi.commands.get("code:push")?.description).toContain("already-committed");
		expect(pi.commands.get("code:push")?.description).toContain("git push");
		expect(pi.commands.get("code:autobranch")?.description).toBe(
			"ccc autobranch: Create a Graphite branch from dirty worktree changes or the latest unpushed commit.",
		);
		expect(pi.commands.get("code:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("code:land")?.description).toBe("Land the current PR or Graphite stack into trunk");
		expect(pi.commands.get("code:pr-feedback-watch")?.description).toContain("current branch PR");
		expect(pi.messageRenderers.has("code-changes-summary")).toBe(true);
		expect(pi.messageRenderers.has(["dev", "changes", "summary"].join("-"))).toBe(false);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has("land-command-stream")).toBe(true);
	});

	test("asdl-dev mirrors are split between code and dev namespaces when project-local extensions are loaded together", () => {
		const pi = new FakePi();

		codeExtension(pi);
		asdlDevExtension(pi);

		expect(pi.commandNames.filter((name) => name === "code:cp")).toEqual([]);
		expect(pi.commandNames.filter((name) => name === "code:submit")).toEqual(["code:submit"]);
		expect(pi.commandNames.filter((name) => name === "code:pr-regen")).toEqual(["code:pr-regen"]);
		expect(pi.commandNames.filter((name) => name === "dev:cp")).toEqual([]);
		expect(pi.commandNames.filter((name) => name === "dev:submit")).toEqual([]);
		expect(pi.commandNames.filter((name) => name === "dev:pr-regen")).toEqual([]);
		expect(pi.commandNames).toEqual([
			"code:changes",
			"code:submit",
			"code:pr-regen",
			"code:push",
			"code:autobranch",
			"code:autoslot",
			"code:land",
			"code:pr-feedback-watch",
			"dev:preview-url",
		]);
	});
});
