import { describe, expect, test } from "bun:test";

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
			"code:cp",
			"code:submit",
			"code:autobranch",
			"code:land",
			"code:land-stack",
		]);
		expect(pi.commands.has("cp")).toBe(false);
		expect(pi.commands.has("autobranch")).toBe(false);
		expect(pi.commands.has("changes")).toBe(false);
		expect(pi.commands.has("summary")).toBe(false);
		expect(pi.commands.has("submit")).toBe(false);
		expect(pi.commands.has("gh:land")).toBe(false);
		expect(pi.commands.has("gt:land-stack")).toBe(false);
		expect(pi.commands.has("land")).toBe(false);
		expect(pi.commands.has("land-stack")).toBe(false);
		const oldCommandPrefix = "dev";
		for (const command of ["cp", "changes", "autobranch", "submit", "land", "land-stack"]) {
			expect(pi.commands.has(`${oldCommandPrefix}:${command}`)).toBe(false);
		}
		expect(pi.commands.get("code:changes")?.description).toContain("without committing");
		expect(pi.commands.get("code:cp")?.description).toBe("asdl-dev cp: Create a checkpoint commit for the current diff.");
		expect(pi.commands.get("code:submit")?.description).toBe(
			"asdl-dev submit: Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --ai.",
		);
		expect(pi.commands.get("code:autobranch")?.description).toContain("generating the branch name and checkpoint commit message");
		expect(pi.messageRenderers.has("code-changes-summary")).toBe(true);
		expect(pi.messageRenderers.has(["dev", "changes", "summary"].join("-"))).toBe(false);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
		expect(pi.messageRenderers.has("land-stack-command-stream")).toBe(true);
	});

	test("asdl-dev mirrors are split between code and dev namespaces when project-local extensions are loaded together", () => {
		const pi = new FakePi();

		codeExtension(pi);
		asdlDevExtension(pi);

		expect(pi.commandNames.filter((name) => name === "code:cp")).toEqual(["code:cp"]);
		expect(pi.commandNames.filter((name) => name === "code:submit")).toEqual(["code:submit"]);
		expect(pi.commandNames.filter((name) => name === "dev:cp")).toEqual([]);
		expect(pi.commandNames.filter((name) => name === "dev:submit")).toEqual([]);
		expect(pi.commandNames).toEqual([
			"code:changes",
			"code:cp",
			"code:submit",
			"code:autobranch",
			"code:land",
			"code:land-stack",
			"dev:preview-url",
		]);
	});
});
