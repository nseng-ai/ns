import { describe, expect, test } from "vitest";

import { gsAutobranchEnvelopeSchema } from "@nseng-ai/gs/api";
import type { EffectiveSkillInfo } from "@nseng-ai/pi-runtime/runtime/extension-types";
import registerGsExtension, {
	buildAutobranchRecoveryPrompt,
	parseGsAutobranchRouterArgs,
	type GsExtensionAPI,
} from "../src/extension.ts";

const data = {
	outcome: "known-partial-failure" as const,
	path: "trunk-bootstrap" as const,
	observedVersion: "0.1.0",
	providerWorktreeGitDir: "/repo/.git",
	trunk: "main",
	source: "main",
	child: "add-child",
	sourceSha: "aaa",
	childSha: "bbb",
	dirty: { staged: 0, unstaged: 0, untracked: 0, total: 0 },
	clean: true,
	checkpointSummary: "bbb [cp] Add child",
	relationship: {
		trunk: "main",
		currentBranch: "add-child",
		top: "add-child",
		sourceTrackedOnce: false,
		sourceCurrent: false,
		sourceTopmost: false,
		childDirectlyAboveSource: false,
		childCurrentTopmost: true,
	},
	effects: ["created-and-switched:add-child", "checkpoint:bbb"],
	diagnostic: "init failed",
	recovery: { action: "inspect-child" as const, instruction: "Inspect child." },
};

type RegisteredCommand = Parameters<GsExtensionAPI["registerCommand"]>[1];

class Host implements GsExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly events: string[] = [];
	readonly messages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
	registerMessageRenderer(): void {}
	sendMessage(message: { customType: string }): void {
		this.events.push(`message:${message.customType}`);
	}
	sendUserMessage(content: string): void {
		this.events.push("user-message");
		this.messages.push(content);
	}
}

function skill(filePath = "/skills/ns-gs-autobranch/SKILL.md"): EffectiveSkillInfo {
	return { name: "ns-gs-autobranch", filePath, baseDir: "/skills/ns-gs-autobranch" };
}

function envelope(
	outcome: typeof data.outcome | "ambiguous-failure" | "refused" | "completed" = data.outcome,
) {
	return outcome === "completed"
		? {
				status: "success" as const,
				exitCode: 0 as const,
				data: { ...data, outcome, recovery: { action: "none" as const, instruction: "Continue." } },
			}
		: {
				status: "negative" as const,
				exitCode: 1 as const,
				message: outcome === "refused" ? "refused" : "recover",
				data: { ...data, outcome },
			};
}

interface RunOptions {
	output?: unknown;
	rawStdout?: string;
	exitCode?: number;
	args?: string;
	skills?: readonly EffectiveSkillInfo[];
	runError?: Error;
	loadError?: Error;
}

async function run(options: RunOptions = {}) {
	const host = new Host();
	const calls: string[][] = [];
	const notifications: Array<{ message: string; level?: string }> = [];
	registerGsExtension(host, {
		readSkillTextFile: async () => {
			if (options.loadError !== undefined) throw options.loadError;
			return "---\nname: ns-gs-autobranch\n---\nRecover forward.";
		},
		runCli: async (argv, deps) => {
			host.events.push("cli");
			calls.push([...argv]);
			if (options.runError !== undefined) throw options.runError;
			const output = options.output ?? envelope();
			deps.stdout(options.rawStdout ?? JSON.stringify(output));
			return (
				options.exitCode ??
				(typeof output === "object" && output !== null && "exitCode" in output
					? Number(output.exitCode)
					: 1)
			);
		},
	});
	const command = host.commands.get("ns:gs:autobranch");
	if (command === undefined) throw new Error("not registered");
	await command.handler(options.args ?? "--slug add-child preserve this context", {
		cwd: "/repo",
		ui: {
			notify: (message, level) =>
				notifications.push({ message, ...(level === undefined ? {} : { level }) }),
		},
		getSystemPromptOptions: () => ({ skills: options.skills ?? [skill()] }),
		waitForIdle: async () => {
			host.events.push("idle");
		},
	});
	return { host, calls, notifications };
}

function expectNoRecovery(state: Awaited<ReturnType<typeof run>>): void {
	expect(state.host.messages).toEqual([]);
	expect(state.host.events).not.toContain("idle");
}

describe("GS Pi autobranch router", () => {
	test("parses only slug and preserves remaining context", () => {
		expect(parseGsAutobranchRouterArgs("inspect --force --slug add-child do not replay")).toEqual({
			slug: "add-child",
			recoveryContext: "inspect --force do not replay",
		});
		expect(parseGsAutobranchRouterArgs("--slug keep-as-context")).toEqual({
			slug: "keep-as-context",
			recoveryContext: "",
		});
		expect(parseGsAutobranchRouterArgs("--slug")).toEqual({
			slug: undefined,
			recoveryContext: "--slug",
		});
	});

	test.each(["known-partial-failure", "ambiguous-failure"] as const)(
		"invokes fresh authorized JSON CLI and hands %s recovery to the captured skill",
		async (outcome) => {
			const state = await run({ output: envelope(outcome) });
			expect(state.calls).toEqual([
				["gs", "autobranch", "--format", "json", "--yes", "--slug", "add-child"],
			]);
			expect(state.host.messages[0]).toContain("Recover forward.");
			expect(state.host.messages[0]).toContain("preserve this context");
			expect(state.host.messages[0]).toContain("Do not replay");
			expect(state.host.events).toEqual(["message:ns-command-ack", "cli", "idle", "user-message"]);
		},
	);

	test("returns on completion and reports refusal without LM recovery", async () => {
		const completed = await run({ output: envelope("completed"), exitCode: 0 });
		expectNoRecovery(completed);
		expect(completed.notifications).toContainEqual({
			message: "GS autobranch completed.",
			level: "info",
		});
		const refused = await run({ output: envelope("refused") });
		expectNoRecovery(refused);
		expect(refused.notifications.at(-1)).toEqual({
			message: "GS autobranch refused: refused",
			level: "error",
		});
	});

	test.each([
		["missing skill", { skills: [] }],
		["ambiguous skill", { skills: [skill("/a"), skill("/b")] }],
		["malformed JSON", { rawStdout: "not json" }],
		["invalid envelope", { output: { status: "negative", exitCode: 1, data: {} } }],
		["process/envelope mismatch", { output: envelope(), exitCode: 0 }],
		["fresh CLI failure", { runError: new Error("loader failed") }],
		["skill load failure", { loadError: new Error("skill read failed") }],
		[
			"untrustworthy outcome",
			{
				output: {
					status: "failure",
					exitCode: 2,
					errorType: "internal",
					message: "failed",
					data,
				},
				exitCode: 2,
			},
		],
	] as const)("fails closed for %s", async (_name, options) => {
		const state = await run(options);
		expect(state.host.messages).toEqual([]);
		expect(state.notifications.at(-1)?.level).toBe("error");
	});

	test("uses collision-safe fences for envelope and user context", () => {
		const collisionEnvelope = {
			...envelope(),
			data: { ...data, diagnostic: "provider emitted ``` unexpectedly" },
		};
		const prompt = buildAutobranchRecoveryPrompt(
			"<skill />",
			gsAutobranchEnvelopeSchema.parse(collisionEnvelope),
			"inspect ``` this only",
		);
		expect(prompt).toContain("authoritative");
		expect(prompt).toContain("````json\n");
		expect(prompt).toContain("````text\ninspect ``` this only\n````");
	});
});
