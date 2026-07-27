import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { createHandoffLaunchIntegration } from "@nseng-ai/handoffs/pi/handoff-launch";
import type {
	CommandContext,
	HandoffCreateSkillLoader,
	HandoffExtensionAPI,
	ToolDefinition,
} from "@nseng-ai/handoffs/pi/handoff-launch";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommand,
	NsCommandSchema,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";

import { formatHerdrHandoffTabRunFailure, launchHerdrHandoffTab } from "../src/core/handoff-tab.ts";
import { herdrHandoffTabLaunchNsCommand } from "../src/ns/commands/handoff-tab-launch.ts";
import { registerHerdrHandoffTab } from "../src/pi/handoff-tab.ts";
import { isExactOptionalIntegrationAbsence } from "../src/pi/extension.ts";
import { FakeHerdrGateway } from "./herdr-test-harness.ts";

const launchOptions = {
	cwd: "/state/slots/repos/ns/worktrees/slot-6",
	launchOptions: {
		model: { provider: "anthropic", id: "claude-test" },
		thinkingLevel: "high" as const,
	},
	workspaceId: "workspace-1",
	slug: "continue-feature",
	pickupCommand: "/ns:handoff:pickup --branch feature continue-feature",
};

const commandArgv = [
	"--branch",
	"feature/test",
	"--slug",
	"continue-work",
	"--workspace-id",
	"workspace-from-prompt",
	"--provider",
	"anthropic",
	"--model",
	"claude-test",
	"--thinking",
	"high",
];

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
					cwd: "/state/slots/repos/ns/worktrees/slot-6",
					label: "handoff:continue-feature",
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

	test("preserves recovery data for both destination failure stages", async () => {
		const createFailure = new FakeHerdrGateway({
			createTabResult: { type: "failed", message: "tab unavailable" },
		});
		expect(await launchHerdrHandoffTab({ ...launchOptions, herdr: createFailure })).toEqual({
			type: "failed",
			stage: "create-tab",
			message: "tab unavailable",
		});
		expect(createFailure.paneRunCalls).toEqual([]);

		const paneFailure = new FakeHerdrGateway({
			createTabResult: {
				type: "created",
				workspaceId: "workspace-1",
				tabId: "tab-2",
				rootPaneId: "pane-2",
			},
			paneRunResult: { type: "failed", message: "pane unavailable" },
		});
		const result = await launchHerdrHandoffTab({ ...launchOptions, herdr: paneFailure });
		if (result.type !== "failed" || result.stage !== "run-in-pane") {
			throw new Error("Expected run-in-pane failure");
		}
		expect(formatHerdrHandoffTabRunFailure(result)).toContain(
			"Manual recovery: herdr pane run pane-2",
		);
	});
});

describe("ns herdr exec handoff-tab launch", () => {
	test("verifies before creating a focused tab and returns stable launch evidence", async () => {
		const events: string[] = [];
		const brmem = new EventBrmemGateway(events);
		await brmem.putEntry({
			namespace: "handoff",
			key: "continue-work.md",
			branch: "feature/test",
			content: "# Continue",
		});
		const herdr = new EventHerdrGateway(events);
		const exit = await runNsCommand(new FakeHerdrNsApi({ brmem, herdr }), commandArgv);

		expect(exit).toMatchObject({
			type: "ok",
			data: {
				branch: "feature/test",
				slug: "continue-work",
				key: "continue-work.md",
				entryLocator: "refs/brmem/ns/handoff/feature---test:continue-work.md",
				workspaceId: "workspace-from-prompt",
				tabId: "tab-1",
				rootPaneId: "pane-1",
				label: "handoff:continue-work",
				pickupCommand: "/ns:handoff:pickup --branch feature/test continue-work",
				command:
					"pi --provider anthropic --model claude-test --thinking high '/ns:handoff:pickup --branch feature/test continue-work'",
			},
		});
		expect(events).toEqual(["verify", "create-tab", "run-in-pane"]);
		expect(herdr.createTabCalls[0]?.options).toEqual({
			workspaceId: "workspace-from-prompt",
			cwd: "/repo",
			label: "handoff:continue-work",
			shouldFocus: true,
		});
	});

	test("returns missing and verification failures without Herdr mutation", async () => {
		const missingHerdr = new FakeHerdrGateway();
		const missing = await runNsCommand(
			new FakeHerdrNsApi({ brmem: new FakeBrmemGateway(), herdr: missingHerdr }),
			commandArgv,
		);
		expect(missing).toMatchObject({
			type: "negative",
			message: "No handoff continue-work found on branch feature/test; no Herdr tab was opened.",
		});
		expect(missingHerdr.createTabCalls).toEqual([]);

		const failedHerdr = new FakeHerdrGateway();
		const failed = await runNsCommand(
			new FakeHerdrNsApi({ brmem: new ThrowingCheckGateway(), herdr: failedHerdr }),
			commandArgv,
		);
		expect(failed).toMatchObject({
			type: "failure",
			errorType: "handoff-verification-failed",
			data: { stage: "verify-handoff" },
		});
		expect(failedHerdr.createTabCalls).toEqual([]);
	});

	test.each([
		["blank branch", ["--branch", " "]],
		["nested slug", ["--slug", "nested/slug"]],
		["blank workspace", ["--workspace-id", " "]],
		["blank provider", ["--provider", " "]],
		["blank model", ["--model", " "]],
		["invalid thinking", ["--thinking", "extreme"]],
	])("rejects %s before verification or effects", async (_name, replacement) => {
		const brmem = new EventBrmemGateway([]);
		const herdr = new FakeHerdrGateway();
		const argv = replaceOption(commandArgv, replacement[0] ?? "", replacement[1] ?? "");
		const exit = await runNsCommand(new FakeHerdrNsApi({ brmem, herdr }), argv);
		expect(exit.type).toBe("usageError");
		expect(brmem.checkCalls).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("returns structured durable-reference recovery for Herdr failures", async () => {
		const brmem = new FakeBrmemGateway();
		await brmem.putEntry({
			namespace: "handoff",
			key: "continue-work.md",
			branch: "feature/test",
			content: "# Continue",
		});
		const createFailed = await runNsCommand(
			new FakeHerdrNsApi({
				brmem,
				herdr: new FakeHerdrGateway({
					createTabResult: { type: "failed", message: "tab unavailable" },
				}),
			}),
			commandArgv,
		);
		expect(createFailed).toMatchObject({
			type: "failure",
			errorType: "herdr-tab-create-failed",
			data: { stage: "create-tab", branch: "feature/test", slug: "continue-work" },
		});

		const paneFailed = await runNsCommand(
			new FakeHerdrNsApi({
				brmem,
				herdr: new FakeHerdrGateway({
					createTabResult: {
						type: "created",
						workspaceId: "workspace-from-prompt",
						tabId: "tab-recovery",
						rootPaneId: "pane-recovery",
					},
					paneRunResult: { type: "failed", message: "pane unavailable" },
				}),
			}),
			commandArgv,
		);
		expect(paneFailed).toMatchObject({
			type: "failure",
			errorType: "herdr-pane-run-failed",
			data: {
				stage: "run-in-pane",
				tabId: "tab-recovery",
				rootPaneId: "pane-recovery",
				manualRecoveryCommand: expect.stringContaining("herdr pane run pane-recovery"),
			},
		});
	});

	test("publishes help and a success-only result schema", async () => {
		const api = new FakeHerdrNsApi();
		const help = await runNsCommandMeta(api, ["-h"]);
		expect(help).toMatchObject({ type: "ok" });
		if (help.type === "ok") expect(String(help.data)).toContain("--workspace-id");
		const schema = await runNsCommandMeta(api, ["--json-schema"]);
		expect(schema).toMatchObject({ type: "ok" });
		if (schema.type !== "ok") throw new Error("Expected JSON Schema output");
		const publishedSchema = JSON.stringify(schema.data);
		expect(publishedSchema).toContain("inputJsonSchema");
		expect(publishedSchema).toContain("outputJsonSchema");
		expect(publishedSchema).toContain("pickupCommand");
		expect(publishedSchema).not.toContain("verify-handoff");
		expect(publishedSchema).toContain('"status":{"type":"string","const":"ok"}');
		expect(publishedSchema).toContain('"status":{"type":"string","const":"negative"}');
	});
});

describe("Herdr Handoff Pi prompt", () => {
	test.each([undefined, "   "])(
		"rejects missing or blank caller workspace before prompt (%s)",
		async (workspaceId) => {
			const pi = new HandoffTabFakePi([
				{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
			]);
			registerHerdrHandoffTab(
				pi,
				createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
				workspaceId === undefined ? {} : { HERDR_WORKSPACE_ID: workspaceId },
			);
			await pi.command().handler("continue work", commandContext());
			expect(pi.sentUserMessages).toEqual([]);
		},
	);

	test("captures exact caller workspace and launch profile in a reference-only CLI prompt", async () => {
		const pi = new HandoffTabFakePi([
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
		]);
		registerHerdrHandoffTab(
			pi,
			createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
			{
				HERDR_WORKSPACE_ID: "workspace-'quoted",
			},
		);
		await pi.command().handler("continue work", commandContext(true));
		const prompt = pi.sentUserMessages[0] ?? "";
		expect(prompt).toContain("Compose the final Markdown handoff artifact content first");
		expect(prompt).toContain("After `ns handoff create` succeeds");
		expect(prompt).toContain("ns herdr exec handoff-tab launch");
		expect(prompt).toContain("--branch feature/test");
		expect(prompt).toContain("--workspace-id 'workspace-'\\''quoted'");
		expect(prompt).toContain("--provider anthropic --model claude-test --thinking high");
		expect(prompt).toContain("--format json");
		expect(prompt).toContain("reads and verifies the stored Handoff Artifact by branch and slug");
		expect(prompt).toContain("do not pipe, quote, or otherwise send the Markdown artifact to it");
		expect(prompt).not.toContain(["herdr", "handoff", "tab", "launch"].join("_"));
		expect(pi.tools.has("derive_handoff_slug_from_content")).toBe(false);
	});

	test("requires an active model before sending the prompt", async () => {
		const pi = new HandoffTabFakePi([
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
		]);
		registerHerdrHandoffTab(
			pi,
			createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
			{
				HERDR_WORKSPACE_ID: "workspace-1",
			},
		);
		await pi.command().handler("continue work", commandContext(false));
		expect(pi.sentUserMessages).toEqual([]);
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
		expect(isExactOptionalIntegrationAbsence(absent)).toBe(true);
		expect(isExactOptionalIntegrationAbsence(transitive)).toBe(false);
		expect(isExactOptionalIntegrationAbsence(new SyntaxError("broken integration"))).toBe(false);
	});
});

interface ExecFixture {
	command: string;
	args: string[];
	stdout?: string;
	stderr?: string;
	code?: number;
}

class HandoffTabFakePi implements HandoffExtensionAPI {
	readonly commands = new Map<string, Parameters<HandoffExtensionAPI["registerCommand"]>[1]>();
	readonly tools = new Map<string, ToolDefinition>();
	readonly sentUserMessages: string[] = [];
	private readonly script: ExecFixture[];

	constructor(script: ExecFixture[]) {
		this.script = [...script];
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

	getAllTools() {
		return [...this.tools.keys()].map((name) => ({ name }));
	}

	getThinkingLevel() {
		return "high" as const;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	command() {
		const command = this.commands.get("ns:herdr:tab:handoff");
		if (command === undefined) throw new Error("handoff tab command not registered");
		return command;
	}
}

class EventBrmemGateway extends FakeBrmemGateway {
	readonly events: string[];
	checkCalls = 0;

	constructor(events: string[]) {
		super();
		this.events = events;
	}

	override async checkEntry(...args: Parameters<FakeBrmemGateway["checkEntry"]>) {
		this.checkCalls += 1;
		this.events.push("verify");
		return super.checkEntry(...args);
	}
}

class ThrowingCheckGateway {
	async checkEntry(): Promise<never> {
		throw new Error("storage unavailable");
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
		this.events.push("create-tab");
		return super.createTab(options);
	}

	override async runInPane(...args: Parameters<FakeHerdrGateway["runInPane"]>) {
		this.events.push("run-in-pane");
		return super.runInPane(...args);
	}
}

class FakeHerdrNsApi implements NsExtensionApi {
	readonly cwd = "/repo";
	readonly env = { HOME: "/home/test" };
	readonly commandIo = noopNsCommandIo;
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly extensions: Readonly<Record<string, unknown>>;

	constructor(options: { brmem?: unknown; herdr?: FakeHerdrGateway } = {}) {
		this.extensions = {
			herdr: {
				brmem: options.brmem ?? new FakeBrmemGateway(),
				herdr: options.herdr ?? new FakeHerdrGateway(),
			},
		};
	}

	async exec(_command: string, _args: string[], _options?: NsExecOptions): Promise<ExecResult> {
		throw new Error("Unexpected real exec in Herdr command test");
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			throw new Error(`Unexpected text generation: ${JSON.stringify(request)}`);
		},
	};
}

function fakeHandoffCreateSkillLoader(): HandoffCreateSkillLoader {
	return {
		async resolveCreateHandoffSkillPath() {
			return "/repo/skills/handoff-create/SKILL.md";
		},
		async loadCreateHandoffSkill() {
			return {
				name: "handoff-create",
				commandName: "direct:handoff-create",
				path: "/repo/skills/handoff-create/SKILL.md",
				baseDir: "/repo/skills/handoff-create",
				body: "# handoff-create",
				block: "# handoff-create",
			};
		},
	};
}

function commandContext(withModel = false): CommandContext {
	return {
		cwd: "/repo",
		hasUI: false,
		mode: "tui",
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getSessionFile: () => undefined,
			getSessionId: () => "test-session-id",
		},
		ui: { notify(): void {}, setStatus(): void {} },
		...(withModel ? { model: { provider: "anthropic", id: "claude-test" } } : {}),
		async waitForIdle(): Promise<void> {},
	};
}

function runNsCommand(api: NsExtensionApi, argv: readonly string[]) {
	return herdrHandoffTabLaunchNsCommand.run(api, { argv: [...argv] });
}

function runNsCommandMeta(api: NsExtensionApi, argv: readonly string[]) {
	const command = herdrHandoffTabLaunchNsCommand as NsCommand<NsCommandSchema, unknown>;
	return command.run(api, { argv: [...argv] });
}

function replaceOption(argv: readonly string[], option: string, value: string): string[] {
	const result = [...argv];
	const index = result.indexOf(option);
	if (index < 0) throw new Error(`Missing option ${option}`);
	result[index + 1] = value;
	return result;
}
