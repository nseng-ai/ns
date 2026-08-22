import { FakeBrmemGateway } from "@nseng-ai/brmem";
import { createHandoffLaunchIntegration } from "@nseng-ai/pi-ns-handoffs/handoff-launch";
import type {
	CommandContext,
	HandoffCreateSkillLoader,
	HandoffExtensionAPI,
	ToolDefinition,
} from "@nseng-ai/pi-ns-handoffs/handoff-launch";
import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import { runCli } from "@nseng-ai/sdk/cli";
import type {
	ExecResult,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";
import { buildPiLaunchCommand } from "@nseng-ai/extension-kit/pi-launch";
import type { ThinkingLevel } from "@nseng-ai/extension-kit/pi-types";
import { describe, expect, test } from "vitest";

import {
	formatHerdrHandoffTabRunFailure,
	herdrHandoffTabLaunchCommand,
	launchHerdrHandoffTab,
} from "@nseng-ai/herdr/api";
import { registerHerdrHandoffTab } from "../src/pi/handoff-tab.ts";
import { isExactOptionalIntegrationAbsence } from "../src/pi/extension.ts";
import { FakeHerdrGateway, failedCallerPane, resolvedCallerPane } from "./herdr-test-harness.ts";

const launchOptions = {
	cwd: "/state/slots/repos/ns/worktrees/slot-6",
	launchCommand: buildPiLaunchCommand("/ns:handoff:pickup --branch feature continue-feature", {
		model: { provider: "anthropic", id: "claude-test" },
		thinkingLevel: "high" as const,
	}),
	workspaceId: "workspace-1",
	slug: "continue-feature",
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
		expect(result.command).toBe(launchOptions.launchCommand);
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
			status: "success",
			data: {
				branch: "feature/test",
				slug: "continue-work",
				key: "continue-work.md",
				entryLocator: "refs/brmem/ns/handoff/feature---test:continue-work.md",
				workspaceId: "workspace-from-prompt",
				tabId: "tab-1",
				rootPaneId: "pane-1",
				label: "handoff:continue-work",
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
			status: "negative",
			message: "No handoff continue-work found on branch feature/test; no Herdr tab was opened.",
		});
		expect(missingHerdr.createTabCalls).toEqual([]);

		const failedHerdr = new FakeHerdrGateway();
		const failed = await runNsCommand(
			new FakeHerdrNsApi({ brmem: new ThrowingCheckGateway(), herdr: failedHerdr }),
			commandArgv,
		);
		expect(failed).toMatchObject({
			status: "failure",
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
		expect(exit.status).toBe("usage-error");
		expect(brmem.checkCalls).toBe(0);
		expect(herdr.createTabCalls).toEqual([]);
	});

	test("accepts thinking off and launches pi without a thinking flag", async () => {
		const brmem = new FakeBrmemGateway();
		await brmem.putEntry({
			namespace: "handoff",
			key: "continue-work.md",
			branch: "feature/test",
			content: "# Continue",
		});
		const herdr = new FakeHerdrGateway({
			createTabResult: {
				type: "created",
				workspaceId: "workspace-from-prompt",
				tabId: "tab-1",
				rootPaneId: "pane-1",
			},
		});
		const argv = replaceOption(commandArgv, "--thinking", "off");
		const exit = await runNsCommand(new FakeHerdrNsApi({ brmem, herdr }), argv);
		expect(exit).toMatchObject({
			status: "success",
			data: {
				command:
					"pi --provider anthropic --model claude-test '/ns:handoff:pickup --branch feature/test continue-work'",
			},
		});
		const paneCommand = herdr.paneRunCalls[0]?.command ?? "";
		expect(paneCommand.startsWith("pi ")).toBe(true);
		expect(paneCommand).not.toContain("--thinking");
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
			status: "failure",
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
			status: "failure",
			errorType: "herdr-pane-run-failed",
			data: {
				stage: "run-in-pane",
				tabId: "tab-recovery",
				rootPaneId: "pane-recovery",
				command:
					"pi --provider anthropic --model claude-test --thinking high '/ns:handoff:pickup --branch feature/test continue-work'",
				manualRecoveryCommand: expect.stringContaining("herdr pane run pane-recovery"),
			},
		});
	});

	test("publishes help and a success-only result schema", async () => {
		const api = new FakeHerdrNsApi();
		const help = await runNsCommandMeta(api, ["-h"]);
		expect(help).toMatchObject({ status: "success" });
		if (help.status !== "success") throw new Error("Expected help output");
		const publishedHelp = String(help.data);
		expect(publishedHelp).toContain("--workspace-id");
		expect(publishedHelp).toContain("--provider");
		expect(publishedHelp).toContain("--model");
		expect(publishedHelp).toContain("--thinking");
		expect(publishedHelp).not.toContain("--launch-command");
		expect(publishedHelp).not.toContain("--launch-argv-json");
		const schema = await runNsCommandMeta(api, ["--json-schema"]);
		expect(schema).toMatchObject({ status: "success" });
		if (schema.status !== "success") throw new Error("Expected JSON Schema output");
		const publishedSchema = String(schema.data);
		expect(publishedSchema).toContain("inputJsonSchema");
		expect(publishedSchema).toContain("outputJsonSchema");
		expect(publishedSchema).not.toContain("launchCommand");
		expect(publishedSchema).toContain("command");
		expect(publishedSchema).not.toContain("pickupCommand");
		expect(publishedSchema).toContain('"provider"');
		expect(publishedSchema).toContain('"model"');
		expect(publishedSchema).toContain('"thinking"');
		expect(publishedSchema).not.toContain("verify-handoff");
		expect(publishedSchema).toContain('"const": "success"');
		expect(publishedSchema).toContain('"const": "negative"');
	});
});

describe("Herdr Handoff Pi prompt", () => {
	test("rejects a failed caller-space resolution before focus interaction, Git inspection, or skill loading", async () => {
		// No Git fixtures: any Git execution would surface as an execCalls entry.
		const pi = new HandoffTabFakePi([]);
		const herdr = new FakeHerdrGateway({ callerPaneResult: failedCallerPane() });
		const skillLoader = countingHandoffCreateSkillLoader();
		const notifications: string[] = [];
		const inputRequests: string[] = [];
		registerHerdrHandoffTab(pi, createHandoffLaunchIntegration(pi, { skillLoader }), herdr);
		// Empty args would prompt for a continuation focus if the flow reached
		// focus resolution; the caller-space failure must stop before that.
		await pi.command().handler("", commandContext({ notifications, inputRequests }));
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		expect(notifications).toEqual([
			expect.stringContaining(
				"error: A Herdr caller space is required before creating a handoff for a Herdr tab.",
			),
		]);
		expect(inputRequests).toEqual([]);
		expect(pi.execCalls).toEqual([]);
		expect(skillLoader.resolveCalls).toBe(0);
		expect(pi.sentUserMessages).toEqual([]);
	});

	test("captures exact caller workspace and launch profile in typed JSON input", async () => {
		const pi = new HandoffTabFakePi([
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
		]);
		const herdr = new FakeHerdrGateway({
			callerPaneResult: resolvedCallerPane("workspace-'quoted"),
		});
		registerHerdrHandoffTab(
			pi,
			createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
			herdr,
		);
		await pi
			.command()
			.handler("continue work", commandContext({ withModel: true, modelId: "claude-'test" }));
		expect(herdr.resolveCallerPaneCalls).toBe(1);
		const prompt = pi.sentUserMessages[0] ?? "";
		expect(prompt).toContain("Compose the final Markdown handoff artifact content first");
		expect(prompt).toContain("After `ns handoff create` succeeds");
		expect(prompt).toContain("ns herdr exec handoff-tab launch --input-json --format json");
		expect(prompt).toContain('"branch":"<returned-branch>"');
		expect(prompt).toContain('"slug":"<returned-slug>"');
		expect(prompt).toContain('"workspaceId":"workspace-');
		expect(prompt).toContain('"provider":"anthropic"');
		expect(prompt).toContain('"model":"claude-');
		expect(prompt).toContain('"thinking":"high"');
		expect(prompt).not.toContain("--launch-command");
		expect(prompt).not.toContain("--launch-argv-json");
		expect(prompt).toContain("reads and verifies the stored Handoff Artifact by branch and slug");
		expect(prompt).toContain("do not pipe, quote, or otherwise send the Markdown artifact to it");
		expect(prompt).not.toContain(["herdr", "handoff", "tab", "launch"].join("_"));
		expect(pi.tools.size).toBe(0);
	});

	test("transports thinking off in the launch command when thinking is off", async () => {
		const pi = new HandoffTabFakePi(
			[{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" }],
			"off",
		);
		registerHerdrHandoffTab(
			pi,
			createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
			new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("workspace-1") }),
		);
		await pi.command().handler("continue work", commandContext({ withModel: true }));
		const prompt = pi.sentUserMessages[0] ?? "";
		expect(prompt).toContain('"thinking":"off"');
		expect(prompt).toContain("--input-json");
		expect(prompt).not.toContain("--launch-argv-json");
	});

	test("requires an active model before sending the prompt", async () => {
		const pi = new HandoffTabFakePi([
			{ command: "git", args: ["branch", "--show-current"], stdout: "feature/test\n" },
		]);
		registerHerdrHandoffTab(
			pi,
			createHandoffLaunchIntegration(pi, { skillLoader: fakeHandoffCreateSkillLoader() }),
			new FakeHerdrGateway({ callerPaneResult: resolvedCallerPane("workspace-1") }),
		);
		await pi.command().handler("continue work", commandContext());
		expect(pi.sentUserMessages).toEqual([]);
	});
});

describe("optional Handoffs integration absence classifier", () => {
	test("suppresses only a realistic exact curated-module miss", () => {
		const absent = Object.assign(
			new Error(
				"Cannot find package '@nseng-ai/pi-ns-handoffs/handoff-launch' imported from /repo/herdr/extension.js",
			),
			{ code: "ERR_MODULE_NOT_FOUND" },
		);
		const transitive = Object.assign(
			new Error(
				"Cannot find package 'broken-transitive' imported from /repo/node_modules/@nseng-ai/pi-ns-handoffs/handoff-launch.js",
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
	readonly execCalls: Array<{ command: string; args: string[] }> = [];
	private readonly script: ExecFixture[];
	private readonly thinkingLevel: ThinkingLevel;

	constructor(script: ExecFixture[], thinkingLevel: ThinkingLevel = "high") {
		this.script = [...script];
		this.thinkingLevel = thinkingLevel;
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

	appendEntry(): void {}

	registerEntryRenderer(): void {}

	async exec(command: string, args: string[]) {
		this.execCalls.push({ command, args });
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
		return this.thinkingLevel;
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
	readonly isInteractive = () => false;
	readonly confirm = () => {
		throw new Error("Unexpected confirmation prompt in Herdr test.");
	};
	readonly select = () => {
		throw new Error("Unexpected selection prompt in Herdr test.");
	};
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

function countingHandoffCreateSkillLoader(): HandoffCreateSkillLoader & { resolveCalls: number } {
	const loader = fakeHandoffCreateSkillLoader();
	return {
		resolveCalls: 0,
		captureSkill(ctx, name) {
			this.resolveCalls += 1;
			return loader.captureSkill(ctx, name);
		},
	};
}

function fakeHandoffCreateSkillLoader(): HandoffCreateSkillLoader {
	return {
		captureSkill() {
			return {
				name: "handoff-create",
				filePath: "/repo/skills/handoff-create/SKILL.md",
				baseDir: "/repo/skills/handoff-create",
				async load() {
					return {
						name: "handoff-create",
						path: "/repo/skills/handoff-create/SKILL.md",
						baseDir: "/repo/skills/handoff-create",
						body: "# handoff-create",
						block: "# handoff-create",
					};
				},
			};
		},
	};
}

function commandContext(
	options: {
		withModel?: boolean;
		modelId?: string;
		notifications?: string[];
		inputRequests?: string[];
	} = {},
): CommandContext {
	const { withModel = false, modelId = "claude-test", notifications, inputRequests } = options;
	return {
		cwd: "/repo",
		hasUI: inputRequests !== undefined,
		mode: "tui",
		sessionManager: {
			getBranch: () => [],
			getEntries: () => [],
			getSessionFile: () => undefined,
			getSessionId: () => "test-session-id",
		},
		getSystemPromptOptions: () => ({ skills: [] }),
		ui: {
			notify(message: string, level?: string): void {
				notifications?.push(`${level ?? "info"}: ${message}`);
			},
			setStatus(): void {},
			...(inputRequests === undefined
				? {}
				: {
						async input(title: string): Promise<string | undefined> {
							inputRequests.push(title);
							return "unexpected focus interaction";
						},
					}),
		},
		...(withModel ? { model: { provider: "anthropic", id: modelId } } : {}),
		async waitForIdle(): Promise<void> {},
	};
}

async function runNsCommand(api: NsExtensionApi, argv: readonly string[]) {
	return await runHerdrCli(api, [...argv, "--format", "json"]);
}

async function runNsCommandMeta(api: NsExtensionApi, argv: readonly string[]) {
	return await runHerdrCli(api, argv);
}

async function runHerdrCli(api: NsExtensionApi, argv: readonly string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const exitCode = await runCli(["herdr", "exec", "handoff-tab", "launch", ...argv], {
		context: api,
		cwd: api.cwd,
		env: api.env,
		stdout: (text) => stdout.push(text),
		stderr: (text) => stderr.push(text),
		extensionRegistry: {
			loadSourceInventory: async () => ({
				sources: [
					{
						label: "herdr test",
						kind: "project" as const,
						origin: "local" as const,
						helpClassification: "extension" as const,
						compose: (root) => {
							root.group("herdr", { description: "Run Herdr destination workflows." }, (herdr) => {
								herdr.group(
									"exec",
									{ description: "Agent-only Herdr operations.", hidden: true },
									(exec) => {
										exec.group(
											"handoff-tab",
											{ description: "Launch stored handoffs in Herdr tabs." },
											(handoffTab) => {
												handoffTab.command(
													"launch",
													{ description: "Launch a stored handoff in a focused Herdr tab." },
													() => herdrHandoffTabLaunchCommand,
												);
											},
										);
									},
								);
							});
						},
					},
				],
				diagnostics: [],
				extensionPackageNames: new Set<string>(),
				builtInPackageNames: new Set<string>(),
			}),
		},
	});
	const output = stdout.join("");
	if (argv.includes("-h") || argv.includes("--json-schema")) {
		return { status: exitCode === 0 ? "success" : "failure", data: output };
	}
	return output === ""
		? { status: exitCode === 2 ? "usage-error" : "failure", message: stderr.join("") }
		: JSON.parse(output);
}

function replaceOption(argv: readonly string[], option: string, value: string): string[] {
	const result = [...argv];
	const index = result.indexOf(option);
	if (index < 0) throw new Error(`Missing option ${option}`);
	result[index + 1] = value;
	return result;
}
