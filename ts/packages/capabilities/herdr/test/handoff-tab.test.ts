import { describe, expect, test } from "vitest";

import { encodeBranchName } from "@nseng-ai/brmem";
import { createHandoffLaunchIntegration } from "@nseng-ai/handoffs/pi/handoff-launch";
import type {
	CommandContext,
	HandoffExtensionAPI,
	ToolDefinition,
} from "@nseng-ai/handoffs/pi/handoff-launch";
import { formatHerdrHandoffTabRunFailure, launchHerdrHandoffTab } from "../src/core/handoff-tab.ts";
import { registerHerdrHandoffTab } from "../src/pi/handoff-tab.ts";
import { isExactOptionalIntegrationAbsence } from "../src/pi/extension.ts";
import { FakeHerdrGateway } from "./herdr-test-harness.ts";

const launchOptions = {
	pi: { getThinkingLevel: () => "high" as const },
	ctx: { cwd: "/repo", model: { provider: "anthropic", id: "claude-test" } },
	workspaceId: "workspace-1",
	slug: "continue-feature",
	pickupCommand: "/ns:handoff:pickup --branch feature continue-feature",
};

describe("Herdr Handoff tab destination", () => {
	test("creates a focused labeled tab and launches pickup in its root pane", async () => {
		const herdr = new FakeHerdrGateway({
			createTabResult: {
				type: "created",
				workspaceId: "workspace-1",
				tabId: "tab-2",
				rootPaneId: "pane-2",
			},
		});

		const result = await launchHerdrHandoffTab({ ...launchOptions, herdr });

		expect(result.type).toBe("launched");
		expect(herdr.createTabCalls).toEqual([
			{
				options: {
					workspaceId: "workspace-1",
					cwd: "/repo",
					label: "handoff: continue-feature",
					shouldFocus: true,
				},
			},
		]);
		expect(herdr.paneRunCalls).toEqual([
			{
				paneId: "pane-2",
				command:
					"pi --provider anthropic --model claude-test --thinking high '/ns:handoff:pickup --branch feature continue-feature'",
			},
		]);
	});

	test("does not run a pane command when tab creation fails", async () => {
		const herdr = new FakeHerdrGateway({
			createTabResult: { type: "failed", message: "tab unavailable" },
		});

		const result = await launchHerdrHandoffTab({ ...launchOptions, herdr });

		expect(result).toEqual({ type: "failed", stage: "create-tab", message: "tab unavailable" });
		expect(herdr.paneRunCalls).toEqual([]);
	});

	test("preserves location and manual recovery after pane launch failure", async () => {
		const herdr = new FakeHerdrGateway({
			createTabResult: {
				type: "created",
				workspaceId: "workspace-1",
				tabId: "tab-2",
				rootPaneId: "pane-2",
			},
			paneRunResult: { type: "failed", message: "pane unavailable" },
		});

		const result = await launchHerdrHandoffTab({ ...launchOptions, herdr });

		expect(result.type).toBe("failed");
		if (result.type === "failed" && result.stage === "run-in-pane") {
			const message = formatHerdrHandoffTabRunFailure(result);
			expect(message).toContain("Tab: tab-2");
			expect(message).toContain("Root pane: pane-2");
			expect(message).toContain("Manual recovery: herdr pane run pane-2");
		}
	});
});

describe("Herdr Handoff command and launch tool", () => {
	test.each([undefined, "   "])(
		"rejects missing or blank caller workspace before prompt and effects (%s)",
		async (workspaceId) => {
			const pi = new HandoffTabFakePi([
				{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
			]);
			const herdr = new FakeHerdrGateway();
			registerHerdrHandoffTab(
				pi,
				createHandoffLaunchIntegration(pi),
				workspaceId === undefined ? {} : { HERDR_WORKSPACE_ID: workspaceId },
				herdr,
			);

			await pi.command().handler("continue work", commandContext());

			expect(pi.sentUserMessages).toEqual([]);
			expect(pi.execCalls).toHaveLength(1);
			expect(herdr.createTabCalls).toEqual([]);
			expect(herdr.paneRunCalls).toEqual([]);
		},
	);

	test("captures exact caller workspace in each prompt instead of registration-wide state", async () => {
		const env = { HERDR_WORKSPACE_ID: "workspace-first" };
		const pi = new HandoffTabFakePi([
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
		]);
		registerHerdrHandoffTab(pi, createHandoffLaunchIntegration(pi), env, new FakeHerdrGateway());

		await pi.command().handler("first focus", commandContext());
		env.HERDR_WORKSPACE_ID = "workspace-second";
		await pi.command().handler("second focus", commandContext());

		expect(pi.sentUserMessages[0]).toContain("Caller Herdr workspace: workspace-first");
		expect(pi.sentUserMessages[0]).toContain("`workspaceId` set exactly to `workspace-first`");
		expect(pi.sentUserMessages[1]).toContain("Caller Herdr workspace: workspace-second");
		expect(pi.sentUserMessages[0]).toContain(
			"Compose the final Markdown handoff artifact content first",
		);
		expect(pi.sentUserMessages[0]).toContain(
			"After `ns handoff create` succeeds, call herdr_handoff_tab_launch",
		);
		expect(pi.sentUserMessages[0]).toContain("`branch` set exactly to `feature/test`");
		expect(pi.sentUserMessages[0]).toContain(
			"Do not call herdr_handoff_tab_launch before the handoff is saved successfully",
		);
	});

	test.each([
		{ branch: "feature/test", slug: "continue-work", workspaceId: "  " },
		{ branch: "", slug: "continue-work", workspaceId: "workspace-from-prompt" },
		{ branch: "feature/test", slug: "nested/slug", workspaceId: "workspace-from-prompt" },
	])("rejects invalid params before verification or Herdr effects", async (params) => {
		const pi = new HandoffTabFakePi([]);
		const herdr = new FakeHerdrGateway();
		registerHerdrHandoffTab(pi, createHandoffLaunchIntegration(pi), {}, herdr);

		const result = await pi.tool().execute("call", params, undefined, undefined, toolContext());

		expect(result.isError).toBe(true);
		expect(pi.execCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("distinguishes missing artifact and verification failure before createTab", async () => {
		const missingPi = new HandoffTabFakePi(checkScript({ exists: false }));
		const missingHerdr = new FakeHerdrGateway();
		registerHerdrHandoffTab(missingPi, createHandoffLaunchIntegration(missingPi), {}, missingHerdr);
		const missing = await missingPi
			.tool()
			.execute("call", launchParams, undefined, undefined, toolContext());
		expect(missing.content[0]?.text).toContain("No handoff continue-work found");
		expect(missingHerdr.createTabCalls).toEqual([]);

		const failedPi = new HandoffTabFakePi([
			{
				command: "git",
				args: ["check-ref-format", "--branch", "feature/test"],
				stdout: "feature/test\n",
			},
			{
				command: "git",
				args: ["cat-file", "-e", `${handoffRef()}:continue-work.md`],
				throwError: new Error("storage unavailable"),
			},
		]);
		const failedHerdr = new FakeHerdrGateway();
		registerHerdrHandoffTab(failedPi, createHandoffLaunchIntegration(failedPi), {}, failedHerdr);
		const failed = await failedPi
			.tool()
			.execute("call", launchParams, undefined, undefined, toolContext());
		expect(failed.content[0]?.text).toContain("storage unavailable");
		expect(failedHerdr.createTabCalls).toEqual([]);
	});

	test.each([
		{
			name: "create-tab failure",
			herdrOptions: { createTabResult: { type: "failed" as const, message: "tab unavailable" } },
			expected: "tab unavailable",
			expectedCreateCalls: 1,
			expectedRunCalls: 0,
		},
		{
			name: "run-in-pane failure",
			herdrOptions: {
				createTabResult: {
					type: "created" as const,
					workspaceId: "workspace-from-prompt",
					tabId: "tab-recovery",
					rootPaneId: "pane-recovery",
				},
				paneRunResult: { type: "failed" as const, message: "pane unavailable" },
			},
			expected: "Manual recovery: herdr pane run pane-recovery",
			expectedCreateCalls: 1,
			expectedRunCalls: 1,
		},
	])("reports $name through the tool contract", async (scenario) => {
		const pi = new HandoffTabFakePi(checkScript({ exists: true }));
		const herdr = new FakeHerdrGateway(scenario.herdrOptions);
		registerHerdrHandoffTab(pi, createHandoffLaunchIntegration(pi), {}, herdr);

		const result = await pi
			.tool()
			.execute("call", launchParams, undefined, undefined, toolContext());

		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain(scenario.expected);
		expect(herdr.createTabCalls).toHaveLength(scenario.expectedCreateCalls);
		expect(herdr.paneRunCalls).toHaveLength(scenario.expectedRunCalls);
	});

	test("verifies before creating and launches in the exact parameter workspace", async () => {
		const events: string[] = [];
		const pi = new HandoffTabFakePi(checkScript({ exists: true }), events);
		const herdr = new EventHerdrGateway(events);
		registerHerdrHandoffTab(pi, createHandoffLaunchIntegration(pi), {}, herdr);

		const result = await pi
			.tool()
			.execute("call", launchParams, undefined, undefined, toolContext());

		expect(result.isError).not.toBe(true);
		expect(events.at(-2)).toBe("createTab:workspace-from-prompt");
		expect(events.at(-1)).toBe("runInPane");
		expect(herdr.createTabCalls[0]?.options.workspaceId).toBe("workspace-from-prompt");
	});
});

describe("optional Handoffs integration absence classifier", () => {
	test("suppresses only a realistic exact curated-module miss", () => {
		const absent = Object.assign(
			new Error(
				"Cannot find package '@nseng-ai/handoffs/pi/handoff-launch' imported from /repo/herdr/extension.js",
			),
			{ code: "ERR_MODULE_NOT_FOUND" },
		);
		const transitive = Object.assign(
			new Error(
				"Cannot find package 'broken-transitive' imported from /repo/node_modules/@nseng-ai/handoffs/pi/handoff-launch.js",
			),
			{ code: "ERR_MODULE_NOT_FOUND" },
		);
		const requireTransitive = Object.assign(
			new Error(
				"Cannot find module 'broken-transitive'\nRequire stack:\n- /repo/node_modules/@nseng-ai/handoffs/pi/handoff-launch.js",
			),
			{ code: "MODULE_NOT_FOUND" },
		);

		expect(isExactOptionalIntegrationAbsence(absent)).toBe(true);
		expect(isExactOptionalIntegrationAbsence(transitive)).toBe(false);
		expect(isExactOptionalIntegrationAbsence(requireTransitive)).toBe(false);
		expect(isExactOptionalIntegrationAbsence(new SyntaxError("broken integration"))).toBe(false);
	});
});

interface ExecFixture {
	command: string;
	args: string[];
	stdout?: string;
	stderr?: string;
	code?: number;
	throwError?: Error;
}

const launchParams = {
	branch: "feature/test",
	slug: "continue-work",
	workspaceId: "workspace-from-prompt",
};

class HandoffTabFakePi implements HandoffExtensionAPI {
	readonly commands = new Map<string, Parameters<HandoffExtensionAPI["registerCommand"]>[1]>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly execCalls: Array<{ command: string; args: string[] }> = [];
	readonly sentUserMessages: string[] = [];
	private readonly script: ExecFixture[];
	private readonly events: string[];

	constructor(script: ExecFixture[], events: string[] = []) {
		this.script = [...script];
		this.events = events;
	}

	registerCommand(
		name: string,
		definition: Parameters<HandoffExtensionAPI["registerCommand"]>[1],
	): void {
		this.commands.set(name, definition);
	}

	registerTool(tool: ToolDefinition): void {
		this.tools.set(tool.name, tool);
	}

	async exec(command: string, args: string[]) {
		this.execCalls.push({ command, args: [...args] });
		this.events.push(`exec:${command}:${args.join(" ")}`);
		const fixture = this.script.shift();
		if (
			fixture === undefined ||
			fixture.command !== command ||
			fixture.args.join("\0") !== args.join("\0")
		) {
			return {
				stdout: "",
				stderr: `unexpected ${command} ${args.join(" ")}`,
				code: 99,
				killed: false,
			};
		}
		if (fixture.throwError !== undefined) throw fixture.throwError;
		return {
			stdout: fixture.stdout ?? "",
			stderr: fixture.stderr ?? "",
			code: fixture.code ?? 0,
			killed: false,
		};
	}

	getCommands(): [] {
		return [];
	}

	getThinkingLevel() {
		return "high" as const;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	command() {
		const command = this.commands.get("ns:herdr:handoff:tab");
		if (command === undefined) throw new Error("handoff tab command not registered");
		return command;
	}

	tool(): ToolDefinition {
		const tool = this.tools.get("herdr_handoff_tab_launch");
		if (tool === undefined) throw new Error("handoff tab tool not registered");
		return tool;
	}
}

class EventHerdrGateway extends FakeHerdrGateway {
	private readonly events: string[];

	constructor(events: string[]) {
		super({
			createTabResult: {
				type: "created",
				workspaceId: "workspace-from-prompt",
				tabId: "tab-1",
				rootPaneId: "pane-1",
			},
		});
		this.events = events;
	}

	override async createTab(options: Parameters<FakeHerdrGateway["createTab"]>[0]) {
		this.events.push(`createTab:${options.workspaceId}`);
		return super.createTab(options);
	}

	override async runInPane(...args: Parameters<FakeHerdrGateway["runInPane"]>) {
		this.events.push("runInPane");
		return super.runInPane(...args);
	}
}

function commandContext(): CommandContext {
	return {
		cwd: "/repo",
		hasUI: false,
		mode: "tui",
		ui: { notify(): void {}, setStatus(): void {} },
		async waitForIdle(): Promise<void> {},
	};
}

function toolContext() {
	return {
		cwd: "/repo",
		hasUI: false,
		mode: "tui" as const,
		model: { provider: "anthropic", id: "claude-test" },
		ui: { notify(): void {}, setStatus(): void {} },
	};
}

function handoffRef(): string {
	const encoded = encodeBranchName("feature/test");
	if (encoded.type === "error") throw new Error(encoded.error.message);
	return `refs/brmem/ns/handoff/${encoded.value}`;
}

function checkScript(options: { exists: boolean }): ExecFixture[] {
	return [
		{
			command: "git",
			args: ["check-ref-format", "--branch", "feature/test"],
			stdout: "feature/test\n",
		},
		{
			command: "git",
			args: ["cat-file", "-e", `${handoffRef()}:continue-work.md`],
			code: options.exists ? 0 : 1,
		},
		...(options.exists
			? [
					{
						command: "git",
						args: ["rev-parse", `${handoffRef()}:continue-work.md`],
						stdout: "blob-sha\n",
					},
					{
						command: "git",
						args: ["cat-file", "-s", `${handoffRef()}:continue-work.md`],
						stdout: "42\n",
					},
					{
						command: "git",
						args: ["log", "-1", "--format=%H%x09%cI", handoffRef()],
						stdout: "commit-sha\t2026-06-05T00:00:00Z\n",
					},
				]
			: []),
	];
}
