import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { InMemoryBranchMemoryGateway } from "@nseng-ai/branch-context/testing";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import type {
	GitCurrentBranchResult,
	GitLocalBranchTip,
	GitOperationResult,
	GitResult,
} from "@nseng-ai/foundation/git";
import { NoSavedPlanAvailableError, type SelectedSavedPlanFile } from "@nseng-ai/plans/api";

import registerGsExtension, {
	GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME,
	GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME,
	type GsExtensionOptions,
} from "../src/extension.ts";
import type { CommandContext, ExtensionAPI } from "../src/host-types.ts";
import { InMemoryGsGateway } from "../src/testing.ts";

const PLAN_FILE = fileURLToPath(import.meta.url);
const TARGET = "implement-provider-neutrality";
const KEY = `${TARGET}.md`;
const selectedPlan: SelectedSavedPlanFile = {
	type: "explicit",
	filePath: PLAN_FILE,
	fileName: KEY,
	savedPlanFileStem: TARGET,
};

class HandlerGitGateway extends InMemoryGitGateway {
	private branch = "feature";

	constructor() {
		super({
			currentBranch: "feature",
			cachedOriginHeadBranch: "main",
			headCommit: "0123456789abcdef0123456789abcdef01234567",
		});
	}

	providerCreatedTarget(): void {
		this.branch = TARGET;
	}

	override async currentBranch(): Promise<GitCurrentBranchResult> {
		return { type: "branch", branch: this.branch };
	}

	override async localBranchPresence(options: {
		branch: string;
	}): Promise<
		| { type: "present"; refName: string; displayCommand: string }
		| { type: "absent"; refName: string }
	> {
		return this.branch === TARGET && options.branch === TARGET
			? {
					type: "present",
					refName: `refs/heads/${TARGET}`,
					displayCommand: `git rev-parse --verify refs/heads/${TARGET}`,
				}
			: { type: "absent", refName: `refs/heads/${options.branch}` };
	}

	override async listLocalBranchTips(): Promise<GitResult<readonly GitLocalBranchTip[]>> {
		return {
			ok: true,
			value:
				this.branch === TARGET
					? [
							{
								name: TARGET,
								headSha: "0123456789abcdef0123456789abcdef01234567",
								headIso: null,
							},
						]
					: [],
		};
	}

	override async checkout(options: { cwd: string; branch: string }): Promise<GitOperationResult> {
		this.branch = options.branch;
		return await super.checkout(options);
	}
}

class HandlerPi implements ExtensionAPI {
	readonly commands = new Map<
		string,
		{ handler(args: string, ctx: CommandContext): Promise<void> | void }
	>();
	readonly events: string[] = [];
	readonly messages: Array<{ customType: string; content: string }> = [];

	registerCommand(
		name: string,
		options: { handler(args: string, ctx: CommandContext): Promise<void> | void },
	): void {
		this.commands.set(name, options);
	}

	async exec(): Promise<{
		type: "exited";
		stdout: string;
		stderr: string;
		code: number;
		signal: null;
	}> {
		throw new Error("unexpected command execution");
	}

	sendMessage(message: { customType: string; content: string }): void {
		this.events.push(`message:${message.customType}`);
		this.messages.push(message);
	}
}

function createHandlerFixture(
	state: {
		gs?: ConstructorParameters<typeof InMemoryGsGateway>[0];
		attachFailure?: { code: string; message: string };
		noSavedPlan?: boolean;
		reuse?: { branch: string; key: string };
	} = {},
) {
	const pi = new HandlerPi();
	const git = new HandlerGitGateway();
	const baseGs = new InMemoryGsGateway(state.gs);
	const brmem = new InMemoryBranchMemoryGateway(
		state.attachFailure === undefined ? {} : { attachFailure: state.attachFailure },
	);
	const gs = {
		inspectLocalStack: baseGs.inspectLocalStack.bind(baseGs),
		async addAboveCurrentStack(options: { cwd: string; targetBranch: string }) {
			const result = await baseGs.addAboveCurrentStack(options);
			if (result.ok) git.providerCreatedTarget();
			return result;
		},
		async initializeStack(options: {
			cwd: string;
			trunkBranch: string;
			branches: readonly string[];
		}) {
			const result = await baseGs.initializeStack(options);
			if (result.ok) git.providerCreatedTarget();
			return result;
		},
	};
	const sessionCalls: unknown[] = [];
	const dispatches: string[] = [];
	const context: CommandContext = {
		cwd: "/repo",
		hasUI: true,
		ui: {
			notify(message, level) {
				pi.events.push(`notify:${level ?? "info"}:${message}`);
			},
			setStatus(_key, value) {
				pi.events.push(`status:${value ?? "clear"}`);
			},
		},
		async waitForIdle() {
			pi.events.push("wait");
		},
		sessionManager: { getBranch: () => [], getSessionFile: () => "/sessions/parent.jsonl" },
		async newSession(options) {
			sessionCalls.push(options);
			await options?.withSession?.({
				...context,
				async sendUserMessage(message: string) {
					dispatches.push(message);
				},
			});
			return { cancelled: false };
		},
	};
	const options: GsExtensionOptions = {
		createContext: () => ({ git, brmem, gs }),
		operations: {
			async resolveSelectedSavedPlanFile() {
				if (state.noSavedPlan === true) {
					throw new NoSavedPlanAvailableError({
						reason: "no-plan-files",
						directoryPath: "/plans",
						message: "no Saved Plan",
					});
				}
				return selectedPlan;
			},
			async derivePlanContentSlug() {
				return {
					slug: TARGET,
					rawOutput: `${TARGET}\n`,
					provider: "test-provider",
					model: "test-model",
				};
			},
			async resolveExistingBranchContextReuse() {
				return {
					branch: state.reuse?.branch ?? "existing-target",
					key: state.reuse?.key ?? "existing.md",
					source: "current-branch",
				};
			},
		},
	};
	registerGsExtension(pi, options);
	return { pi, git, gs: baseGs, brmem, context, sessionCalls, dispatches };
}

async function invoke(
	fixture: ReturnType<typeof createHandlerFixture>,
	commandName: string,
	args: string,
): Promise<void> {
	const command = fixture.pi.commands.get(commandName);
	if (command === undefined) throw new Error(`Command ${commandName} was not registered.`);
	await command.handler(args, fixture.context);
}

function expectImmediateAckFirst(fixture: ReturnType<typeof createHandlerFixture>): void {
	expect(fixture.pi.events[0]).toBe("message:ns-command-ack");
	expect(fixture.pi.messages[0]?.customType).toBe("ns-command-ack");
}

describe("registered GS command handlers", () => {
	test("reject provider flags before constructing mutation context", async () => {
		const fixture = createHandlerFixture();
		await invoke(fixture, GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME, "--graphite");
		expectImmediateAckFirst(fixture);
		expect(fixture.gs.inspectionCalls).toEqual([]);
		expect(fixture.git.checkoutCalls).toEqual([]);
		expect(fixture.brmem.putEntryCalls).toEqual([]);
		expect(fixture.sessionCalls).toEqual([]);
		expect(fixture.pi.messages.at(-1)?.content).toContain("Unknown flag: --graphite");
	});

	test("creation dry-run resolves exact init/adopt topology without mutation", async () => {
		const fixture = createHandlerFixture();
		await invoke(fixture, GS_NEW_BRANCH_FROM_PLAN_COMMAND_NAME, "--dry-run");
		expectImmediateAckFirst(fixture);
		expect(fixture.gs.inspectionCalls).toEqual([{ cwd: "/repo" }]);
		expect(fixture.gs.addCalls).toEqual([]);
		expect(fixture.gs.initializeCalls).toEqual([]);
		expect(fixture.git.createBranchAtStartPointCalls).toEqual([]);
		expect(fixture.git.checkoutCalls).toEqual([]);
		expect(fixture.brmem.putEntryCalls).toEqual([]);
		expect(fixture.sessionCalls).toEqual([]);
		expect(fixture.pi.messages.at(-1)?.content).toContain("Topology action: init/adopt");
		expect(fixture.pi.messages.at(-1)?.content).toContain(`Target branch: ${TARGET}`);
	});

	test("no-Saved-Plan reuse skips GS and launches implementation", async () => {
		const fixture = createHandlerFixture({ noSavedPlan: true });
		await invoke(fixture, GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME, "");
		expectImmediateAckFirst(fixture);
		expect(fixture.gs.inspectionCalls).toEqual([]);
		expect(fixture.gs.addCalls).toEqual([]);
		expect(fixture.gs.initializeCalls).toEqual([]);
		expect(fixture.brmem.putEntryCalls).toEqual([]);
		expect(fixture.sessionCalls).toHaveLength(1);
		expect(fixture.dispatches).toEqual(["/ns:branch-context:impl-attached-plan existing.md"]);
	});

	test("creation failure prevents attachment and session launch", async () => {
		const fixture = createHandlerFixture({
			gs: { initializeResult: { ok: false, error: { code: "gs-init", message: "init failed" } } },
		});
		await invoke(fixture, GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME, "");
		expectImmediateAckFirst(fixture);
		expect(fixture.brmem.putEntryCalls).toEqual([]);
		expect(fixture.sessionCalls).toEqual([]);
		expect(fixture.pi.messages.at(-1)?.content).toContain("init failed");
	});

	test("attachment failure prevents session launch", async () => {
		const fixture = createHandlerFixture({
			attachFailure: { code: "attach", message: "attach failed" },
		});
		await invoke(fixture, GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME, "");
		expectImmediateAckFirst(fixture);
		expect(fixture.brmem.putEntryCalls).toHaveLength(1);
		expect(fixture.sessionCalls).toEqual([]);
		expect(fixture.pi.messages.at(-1)?.content).toContain("attach failed");
	});

	test("successful create attaches and dispatches in a fresh session", async () => {
		const fixture = createHandlerFixture();
		await invoke(fixture, GS_IMPL_BRANCH_FROM_PLAN_COMMAND_NAME, "");
		expectImmediateAckFirst(fixture);
		expect(fixture.gs.initializeCalls).toEqual([
			{ cwd: "/repo", trunkBranch: "main", branches: ["feature", TARGET] },
		]);
		expect(fixture.brmem.putEntryCalls).toMatchObject([{ branch: TARGET, key: KEY }]);
		expect(fixture.sessionCalls).toHaveLength(1);
		expect(fixture.dispatches).toEqual([`/ns:branch-context:impl-attached-plan ${KEY}`]);
	});
});
