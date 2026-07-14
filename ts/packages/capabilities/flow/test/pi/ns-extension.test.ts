import { join } from "node:path";

import type { ExecOptions, ExecResult } from "@nseng-ai/foundation/exec";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { describe, expect, test } from "vitest";

import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	type CommandContext,
} from "@nseng-ai/pi/commands/cli-extension";
import type {
	ProjectConfigPathExistsResult,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";
import nsExtension, {
	type NsExtensionAPI,
	type NsExtensionOptions,
} from "../../src/pi/ns-extension.ts";
import { FLOW_SUBMIT_CHECK_FAILURE_MARKER } from "../../src/submit/submit-hooks.ts";
import {
	FLOW_SUBMIT_CHECK_RECOVERY_POINT_ID,
	type SubmitCheckRecoveryPromptGateway,
} from "../../src/submit/submit-check-recovery.ts";
import { resolveFlowSubmitRecoveryDefault } from "../support/submit-check-recovery.ts";

type RegisteredCommand = Parameters<NsExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<NsExtensionAPI["sendMessage"]>>[0];
type FlowCommandName =
	| "changes"
	| "cp"
	| "autobranch"
	| "branch-latest-commit"
	| "autoslot"
	| "submit"
	| "regenerate-pr"
	| "push"
	| "land"
	| "pull-trunk"
	| "squash-stack";

const FLOW_COMMANDS = [
	"changes",
	"cp",
	"autobranch",
	"branch-latest-commit",
	"autoslot",
	"submit",
	"regenerate-pr",
	"push",
	"land",
	"pull-trunk",
	"squash-stack",
] as const satisfies readonly FlowCommandName[];
const PACKAGED_RECOVERY_PROMPT = "Packaged recovery prompt\n";
const DEFAULT_PROMPT_PATH = resolveFlowSubmitRecoveryDefault().absolutePath;

class FakePi implements NsExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messageRenderers = new Map<string, unknown>();
	readonly sentMessages: CustomMessage[] = [];
	readonly ackMessages: CustomMessage[] = [];
	readonly progressMessages: CustomMessage[] = [];
	readonly userMessages: string[] = [];
	readonly deliveryEvents: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(customType: string, renderer: unknown): void {
		if (customType === "ns-command-ack") return;
		this.messageRenderers.set(customType, renderer);
	}

	readonly sendMessage = (message: CustomMessage): void => {
		if (message.customType === "ns-command-ack") {
			this.ackMessages.push(message);
			return;
		}
		if (message.customType === "ns-command-progress") {
			this.progressMessages.push(message);
			return;
		}
		this.sentMessages.push(message);
		this.deliveryEvents.push("command-output");
	};

	async exec(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
		return { type: "exited", stdout: "", stderr: "", code: 0, signal: null };
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
		this.deliveryEvents.push("user-message");
	}
}

function registerNsExtension(pi: FakePi, options: NsExtensionOptions): void {
	nsExtension(pi, {
		recoveryGit: new InMemoryGitGateway({ optionalRepoRoot: "/repo" }),
		...options,
	});
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) throw new Error(`Expected command to be registered: ${name}`);
	return command;
}

function expectSingleCommandOutput(
	messages: readonly CustomMessage[],
	expectedOutput: string,
): void {
	expect(messages).toHaveLength(1);
	expect(String(messages[0]?.content)).toContain(expectedOutput);
}

function createContext(cwd: string): CommandContext {
	return {
		cwd,
		hasUI: true,
		ui: {
			notify() {},
			setStatus() {},
			setWidget() {},
		},
		async waitForIdle() {},
	};
}

describe("ns Pi extension", () => {
	test("exposes only nested flow ns lifecycle mirrors", () => {
		const pi = new FakePi();

		registerNsExtension(pi, { runCli: async () => 0 });

		expect([...pi.commands.keys()]).toEqual(FLOW_COMMANDS.map((name) => `ns:flow:${name}`));
		for (const legacyAlias of [
			"sdl:changes",
			"sdl:cp",
			"sdl:autobranch",
			"sdl:submit",
			"sdl:regenerate-pr",
			"sdl:push",
			"sdl:code:changes",
			"sdl:code:autoslot",
			"sdl:code:land",
			"sdl:code:pull-trunk",
		]) {
			expect(pi.commands.has(legacyAlias)).toBe(false);
		}
		expect(pi.commands.get("ns:flow:cp")?.description).toBe(
			"ns flow cp: Create a checkpoint commit for the current diff.",
		);
		expect(pi.commands.get("ns:flow:branch-latest-commit")?.description).toBe(
			"ns flow branch-latest-commit: Move the latest eligible commit to a new Graphite child branch.",
		);
		expect(pi.commands.get("ns:flow:autoslot")?.description).toContain("managed slot worktree");
		expect(pi.commands.get("ns:flow:land")?.description).toBe(
			"ns flow land: Land the current PR or Graphite stack into trunk.",
		);
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
	});

	for (const commandName of FLOW_COMMANDS) {
		test(`routes ns flow ${commandName} to the ns CLI with flow argv`, async () => {
			const pi = new FakePi();
			const runCliCalls: string[][] = [];
			registerNsExtension(pi, {
				runCli: async (args, deps) => {
					runCliCalls.push([...args]);
					deps.stdout(`pi-custom-${commandName}`);
					return 0;
				},
			});

			await commandFor(pi, `ns:flow:${commandName}`).handler("", createContext("/work"));

			expect(runCliCalls).toEqual([["flow", commandName]]);
			expectSingleCommandOutput(pi.sentMessages, `pi-custom-${commandName}`);
		});
	}

	test.each([FLOW_SUBMIT_CHECK_FAILURE_MARKER, `error: ${FLOW_SUBMIT_CHECK_FAILURE_MARKER}`])(
		"sends one descriptor-default recovery turn after marker-bearing submit output: %s",
		async (marker) => {
			const pi = new FakePi();
			registerNsExtension(pi, {
				recoveryPromptGateway: createRecoveryPromptGateway(),
				runCli: async (_args, deps) => {
					deps.stderr(`${marker}\ncheck failed\n`);
					return 1;
				},
			});

			await commandFor(pi, "ns:flow:submit").handler("", createContext("/repo/nested"));

			expectSingleCommandOutput(pi.sentMessages, marker);
			expect(pi.userMessages).toHaveLength(1);
			expect(pi.userMessages[0]).toContain(PACKAGED_RECOVERY_PROMPT.trim());
			expect(pi.deliveryEvents).toEqual(["command-output", "user-message"]);
		},
	);

	test("uses repository recovery policy instead of the descriptor default", async () => {
		const pi = new FakePi();
		registerNsExtension(pi, {
			recoveryPromptGateway: createRecoveryPromptGateway({
				prompt: "Repository recovery policy\n",
			}),
			runCli: async (_args, deps) => {
				deps.stderr(`${FLOW_SUBMIT_CHECK_FAILURE_MARKER}\nfailed\n`);
				return 2;
			},
		});

		await commandFor(pi, "ns:flow:submit").handler("", createContext("/repo"));

		expect(pi.userMessages).toHaveLength(1);
		expect(pi.userMessages[0]).toContain("Repository recovery policy");
		expect(pi.userMessages[0]).not.toContain(PACKAGED_RECOVERY_PROMPT.trim());
	});

	test("ignores successes, non-exact markers, and marker-bearing non-submit commands", async () => {
		const successPi = new FakePi();
		registerNsExtension(successPi, {
			recoveryPromptGateway: createRecoveryPromptGateway(),
			runCli: async (_args, deps) => {
				deps.stderr(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
				return 0;
			},
		});
		await commandFor(successPi, "ns:flow:submit").handler("", createContext("/repo"));
		expect(successPi.userMessages).toEqual([]);

		const prosePi = new FakePi();
		registerNsExtension(prosePi, {
			recoveryPromptGateway: createRecoveryPromptGateway(),
			runCli: async (_args, deps) => {
				deps.stderr(`prefix ${FLOW_SUBMIT_CHECK_FAILURE_MARKER}`);
				return 1;
			},
		});
		await commandFor(prosePi, "ns:flow:submit").handler("", createContext("/repo"));
		expect(prosePi.userMessages).toEqual([]);

		const otherPi = new FakePi();
		registerNsExtension(otherPi, {
			recoveryPromptGateway: createRecoveryPromptGateway(),
			runCli: async (_args, deps) => {
				deps.stderr(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
				return 1;
			},
		});
		await commandFor(otherPi, "ns:flow:changes").handler("", createContext("/repo"));
		expect(otherPi.userMessages).toEqual([]);
	});

	test("hard-fails recovery when the command cwd has no Git root", async () => {
		const pi = new FakePi();
		registerNsExtension(pi, {
			recoveryPromptGateway: createRecoveryPromptGateway(),
			recoveryGit: new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } }),
			runCli: async (_args, deps) => {
				deps.stderr(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
				return 1;
			},
		});

		await expect(
			commandFor(pi, "ns:flow:submit").handler("", createContext("/outside/work")),
		).rejects.toThrow(
			"Could not start flow submit-check recovery: Could not find a Git repository root from cwd /outside/work",
		);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.userMessages).toEqual([]);
	});

	test.each([
		["empty", { prompt: " \n" }],
		["unreadable", { promptReadError: "permission denied" }],
	] as const)("hard-fails recovery when the selected prompt is %s", async (_name, state) => {
		const pi = new FakePi();
		registerNsExtension(pi, {
			recoveryPromptGateway: createRecoveryPromptGateway(state),
			runCli: async (_args, deps) => {
				deps.stderr(FLOW_SUBMIT_CHECK_FAILURE_MARKER);
				return 1;
			},
		});

		await expect(
			commandFor(pi, "ns:flow:submit").handler("", createContext("/repo")),
		).rejects.toThrow("Could not start flow submit-check recovery:");
		expect(pi.userMessages).toEqual([]);
	});

	test("sends bounded context with the original submit arguments", async () => {
		const pi = new FakePi();
		const noisyStderr = [
			FLOW_SUBMIT_CHECK_FAILURE_MARKER,
			"",
			"Pre-submit check failed (exit code 9).",
			"",
			"Command: just",
			"",
			...Array.from({ length: 60 }, (_, index) => `line-${index} ${"x".repeat(100)}`),
		].join("\n");
		registerNsExtension(pi, {
			recoveryPromptGateway: createRecoveryPromptGateway(),
			runCli: async (_args, deps) => {
				deps.stderr(noisyStderr);
				return 9;
			},
		});

		await commandFor(pi, "ns:flow:submit").handler(
			'--message "hello world"',
			createContext("/repo"),
		);

		expect(pi.userMessages[0]).toContain("Invocation: ns flow submit --message 'hello world'");
		expect(pi.userMessages[0]).toContain("    Command: just");
		expect(pi.userMessages[0]).toMatch(/… \d+ earlier line\(s\) omitted/u);
		expect(pi.userMessages[0]).toContain("    line-59");
		expect(pi.userMessages[0]?.length).toBeLessThan(6_000);
	});
});

interface RecoveryPromptGatewayState {
	prompt?: string;
	promptReadError?: string;
}

function createRecoveryPromptGateway(
	state: RecoveryPromptGatewayState = {},
): SubmitCheckRecoveryPromptGateway {
	const conventionalPromptPath = join(
		"/repo",
		`.ns/prompts/${FLOW_SUBMIT_CHECK_RECOVERY_POINT_ID}.md`,
	);
	const files = new Map<string, string>([[DEFAULT_PROMPT_PATH, PACKAGED_RECOVERY_PROMPT]]);
	if (state.prompt !== undefined) files.set(conventionalPromptPath, state.prompt);
	const promptReadErrors = new Map<string, string>();
	if (state.promptReadError !== undefined) {
		promptReadErrors.set(conventionalPromptPath, state.promptReadError);
	}
	return new InMemoryRecoveryPromptGateway({ files, promptReadErrors });
}

class InMemoryRecoveryPromptGateway implements SubmitCheckRecoveryPromptGateway {
	readonly #files: ReadonlyMap<string, string>;
	readonly #promptReadErrors: ReadonlyMap<string, string>;

	constructor(state: {
		files: ReadonlyMap<string, string>;
		promptReadErrors: ReadonlyMap<string, string>;
	}) {
		this.#files = new Map(state.files);
		this.#promptReadErrors = new Map(state.promptReadErrors);
	}

	readTextFile(request: { repoRoot: string; relativePath: string }): ProjectConfigReadResult {
		return this.readPath(join(request.repoRoot, request.relativePath));
	}

	pathExists(request: { repoRoot: string; relativePath: string }): ProjectConfigPathExistsResult {
		const path = join(request.repoRoot, request.relativePath);
		return this.#files.has(path) || this.#promptReadErrors.has(path)
			? { type: "present" }
			: { type: "missing" };
	}

	readRecoveryPrompt(request: {
		path: string;
	}): ReturnType<SubmitCheckRecoveryPromptGateway["readRecoveryPrompt"]> {
		const error = this.#promptReadErrors.get(request.path);
		if (error !== undefined) return { type: "error", message: error };
		return this.readPath(request.path);
	}

	private readPath(path: string): ProjectConfigReadResult {
		const text = this.#files.get(path);
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}
}
