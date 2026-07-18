import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

import { createFlowStackCommand, FLOW_STACK_COMMAND_SUMMARY } from "../../src/ns/commands/stack.ts";
import type {
	PiCommandHost,
	PiCommandHostRequest,
	PiCommandHostResult,
} from "../../src/pi-command-host/index.ts";
import { ScriptedNsTestContext } from "./ns-cli-fakes.ts";

class FakePiCommandHost implements PiCommandHost {
	readonly requests: PiCommandHostRequest[] = [];
	private readonly result: PiCommandHostResult;

	constructor(result: PiCommandHostResult) {
		this.result = result;
	}

	async run(request: PiCommandHostRequest): Promise<PiCommandHostResult> {
		this.requests.push({ ...request, extensionFactories: [...request.extensionFactories] });
		return this.result;
	}
}

const extensionFactory: ExtensionFactory = () => undefined;

function createContext(): ScriptedNsTestContext {
	return new ScriptedNsTestContext(
		{},
		{
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	);
}

function createCommand(
	options: {
		result?: PiCommandHostResult;
		isInteractiveTerminal?: boolean;
		loadStackViewExtension?: () => Promise<ExtensionFactory>;
	} = {},
) {
	const host = new FakePiCommandHost(options.result ?? { type: "completed", exitCode: 0 });
	const command = createFlowStackCommand({
		createHost: () => host,
		isInteractiveTerminal: () => options.isInteractiveTerminal ?? true,
		loadStackViewExtension: options.loadStackViewExtension ?? (async () => extensionFactory),
	});
	return { command, host };
}

describe("flow stack command", () => {
	test("runs stack:view through the process-owning Pi host", async () => {
		const { command, host } = createCommand();

		const result = await command.run(createContext(), { argv: [] });

		expect(result).toEqual({ type: "ok", data: "stack view closed", human: "stack view closed" });
		expect(host.requests).toEqual([
			{
				cwd: "/work",
				command: "stack:view",
				extensionFactories: [extensionFactory],
				exitPolicy: "after-command",
				presentation: "fullscreen-takeover",
			},
		]);
	});

	test("refuses a non-interactive terminal before loading Pi", async () => {
		let loadCount = 0;
		const { command, host } = createCommand({
			isInteractiveTerminal: false,
			loadStackViewExtension: async () => {
				loadCount += 1;
				return extensionFactory;
			},
		});

		const result = await command.run(createContext(), { argv: [] });

		expect(result).toEqual({
			type: "usageError",
			errorType: "usageError",
			message: "ns flow stack requires an interactive stdin and stdout terminal.",
			data: { requirement: "interactive-terminal" },
		});
		expect(loadCount).toBe(0);
		expect(host.requests).toEqual([]);
	});

	test("renders help without requiring a TTY", async () => {
		const { command } = createCommand({ isInteractiveTerminal: false });

		const result = await command.run(createContext(), {
			argv: ["-h"],
			commandPath: ["flow", "stack"],
		});

		expect(result.type).toBe("ok");
		if (result.type !== "ok") throw new Error("expected help success");
		expect(result.data).toContain(FLOW_STACK_COMMAND_SUMMARY);
		expect(result.data).toContain("Usage: ns flow stack");
		expect(result.data).toContain("Requires an interactive stdin and stdout terminal.");
	});

	test("rejects arguments", async () => {
		const { command } = createCommand();

		const result = await command.run(createContext(), { argv: ["unexpected"] });

		expect(result).toEqual({
			type: "usageError",
			errorType: "usageError",
			message: "ns flow stack does not accept arguments.",
			data: { arguments: ["unexpected"] },
		});
	});

	test.each([
		[{ type: "unavailable", message: "install Pi", exitCode: 2 } as const, "pi-unavailable"],
		[{ type: "failed", message: "command broke", exitCode: 2 } as const, "pi-command-failed"],
	])("maps host result %s to failure %s", async (hostResult, errorType) => {
		const { command } = createCommand({ result: hostResult });

		const result = await command.run(createContext(), { argv: [] });

		expect(result).toEqual({ type: "failure", errorType, message: hostResult.message });
	});

	test("maps extension loading failure to Pi unavailable", async () => {
		const { command } = createCommand({
			loadStackViewExtension: async () => {
				throw new Error("missing optional dependency");
			},
		});

		const result = await command.run(createContext(), { argv: [] });

		expect(result).toEqual({
			type: "failure",
			errorType: "pi-unavailable",
			message: "missing optional dependency",
		});
	});
});
