import { describe, expect, test } from "vitest";

import type {
	CliCommandExtensionAPI,
	CommandContext,
} from "@nseng-ai/pi-runtime/commands/cli-extension";
import type { EffectiveSkillInfo } from "@nseng-ai/pi-runtime/runtime/extension-types";
import registerGsExtension, {
	buildConflictResolverPrompt,
	parseGsRestackResolveRouterArgs,
	type GsExtensionAPI,
} from "../src/extension.ts";
import { gsRestackResolveEnvelopeSchema } from "@nseng-ai/gs/api";

const resultData = {
	outcome: "conflict-stopped" as const,
	mode: "start" as const,
	requestedScope: "full" as const,
	observedVersion: "0.1.0",
	currentOperation: "rebase" as const,
	branch: { state: "detached" as const },
	unmergedPaths: ["src/a.ts"],
	hasStagedChanges: false,
	recovery: { action: "resolve-conflicts" as const, instruction: "Resolve and stage." },
	diagnostic: null,
};

type RegisteredCommand = Parameters<GsExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<CliCommandExtensionAPI["sendMessage"]>>[0];
type MessageRenderer = Parameters<
	NonNullable<CliCommandExtensionAPI["registerMessageRenderer"]>
>[1];

class FakeHost implements GsExtensionAPI {
	command: RegisteredCommand | undefined;
	readonly userMessages: string[] = [];
	readonly outputMessages: CustomMessage[] = [];
	registerCommand(_name: string, command: RegisteredCommand): void {
		this.command = command;
	}
	registerMessageRenderer = (_customType: string, _renderer: MessageRenderer): void => {};
	sendMessage = (message: CustomMessage): void => {
		this.outputMessages.push(message);
	};
	sendUserMessage = (content: string): void => {
		this.userMessages.push(content);
	};
}

function skill(filePath = "/skills/ns-gs-restack-resolve/SKILL.md"): EffectiveSkillInfo {
	return { name: "ns-gs-restack-resolve", filePath, baseDir: "/skills/ns-gs-restack-resolve" };
}

function context(skills: readonly EffectiveSkillInfo[]) {
	const notifications: Array<{ message: string; level: string | undefined }> = [];
	return {
		ctx: {
			cwd: "/repo",
			hasUI: true,
			ui: { notify: (message: string, level?: string) => notifications.push({ message, level }) },
			getSystemPromptOptions: () => ({ skills }),
			waitForIdle: async () => {},
		} satisfies CommandContext & {
			getSystemPromptOptions(): { skills: readonly EffectiveSkillInfo[] };
		},
		notifications,
	};
}

function envelope(status: "success" | "negative" = "negative") {
	return status === "success"
		? {
				status,
				exitCode: 0,
				data: {
					...resultData,
					outcome: "completed",
					currentOperation: "none",
					unmergedPaths: [],
					recovery: { action: "none", instruction: "Continue." },
				},
			}
		: { status, exitCode: 1, message: "The provider stopped at a conflict.", data: resultData };
}

async function run(options: {
	skills?: readonly EffectiveSkillInfo[];
	stdout?: string;
	exitCode?: number;
	args?: string;
	processError?: Error;
}) {
	const host = new FakeHost();
	const calls: string[][] = [];
	registerGsExtension(host, {
		readSkillTextFile: async () => "---\nname: ns-gs-restack-resolve\n---\nResolve carefully.",
		runCli: async (args, deps) => {
			calls.push([...args]);
			if (options.processError !== undefined) throw options.processError;
			deps.stdout(options.stdout ?? JSON.stringify(envelope()));
			return options.exitCode ?? 1;
		},
	});
	const state = context(options.skills ?? [skill()]);
	if (host.command === undefined) throw new Error("command not registered");
	await host.command.handler(options.args ?? "", state.ctx);
	return { host, calls, notifications: state.notifications };
}

describe("GS Pi restack router", () => {
	test("preserves resolver context and rejects an explicit downstack flag", () => {
		expect(parseGsRestackResolveRouterArgs("resolve ours then test --force")).toEqual({
			type: "accepted",
			resolverContext: "resolve ours then test --force",
		});
		expect(parseGsRestackResolveRouterArgs("resolve ours --downstack then test")).toEqual({
			type: "rejected",
			message: "--downstack is not accepted; GS restack already defaults to downstack scope.",
		});
	});

	test("returns on clean completion without an LM turn", async () => {
		const state = await run({ stdout: JSON.stringify(envelope("success")), exitCode: 0 });
		expect(state.calls).toEqual([["gs", "restack-resolve", "--format", "json", "--yes"]]);
		expect(state.host.userMessages).toEqual([]);
		expect(state.host.outputMessages).toHaveLength(1);
	});

	test("hands a trustworthy conflict and user context to the exact captured skill", async () => {
		const state = await run({ args: "prefer generated file" });
		expect(state.calls).toEqual([["gs", "restack-resolve", "--format", "json", "--yes"]]);
		expect(state.host.userMessages).toHaveLength(1);
		expect(state.host.userMessages[0]).toContain("Resolve carefully.");
		expect(state.host.userMessages[0]).toContain('"outcome": "conflict-stopped"');
		expect(state.host.userMessages[0]).toContain("prefer generated file");
	});

	test("rejects an explicit downstack flag before skill capture or CLI execution", async () => {
		const state = await run({ args: "--downstack prefer generated file", skills: [] });
		expect(state.calls).toEqual([]);
		expect(state.host.userMessages).toEqual([]);
		expect(state.host.outputMessages[0]?.content).toContain(
			"--downstack is not accepted; GS restack already defaults to downstack scope.",
		);
		expect(state.host.outputMessages[0]?.details).toMatchObject({ level: "error" });
		expect(state.notifications).toEqual([]);
	});

	test("hands off a pre-existing interrupted rebase without changing provider scope", async () => {
		const continued = {
			...envelope(),
			data: { ...resultData, mode: "continue" as const },
		};
		const state = await run({ stdout: JSON.stringify(continued), exitCode: 1 });
		expect(state.calls).toEqual([["gs", "restack-resolve", "--format", "json", "--yes"]]);
		expect(state.host.userMessages[0]).toContain('"mode": "continue"');
	});

	test.each([
		["missing", []],
		["ambiguous", [skill("/a"), skill("/b")]],
	] as const)("fails closed when effective skill is %s", async (_name, skills) => {
		const state = await run({ skills });
		expect(state.calls).toEqual([]);
		expect(state.host.userMessages).toEqual([]);
		expect(state.host.outputMessages[0]?.details).toMatchObject({ level: "error" });
	});

	test.each([
		["malformed", "not json", 1],
		["mismatch", JSON.stringify(envelope()), 0],
		["refused", JSON.stringify({ ...envelope(), data: { ...resultData, outcome: "refused" } }), 1],
	] as const)("fails closed for %s CLI output", async (_name, stdout, exitCode) => {
		const state = await run({ stdout, exitCode });
		expect(state.host.userMessages).toEqual([]);
		if (_name === "refused") {
			expect(state.notifications).toEqual([]);
		} else {
			expect(state.notifications.at(-1)?.level).toBe("warning");
		}
	});

	test("fails closed when the fresh CLI process throws", async () => {
		const state = await run({ processError: new Error("loader failed") });
		expect(state.host.userMessages).toEqual([]);
		expect(state.host.outputMessages[0]?.content).toContain("loader failed");
		expect(state.notifications).toEqual([]);
	});

	test("builds an evidence-first resolver prompt with collision-safe fences", () => {
		const prompt = buildConflictResolverPrompt(
			"<skill />",
			gsRestackResolveEnvelopeSchema.parse(envelope()),
			"keep ``` ours",
		);
		expect(prompt).toContain("authoritative");
		expect(prompt).toContain("````text\nkeep ``` ours\n````");
		expect(prompt).toContain("Do not rerun the start step");
	});
});
