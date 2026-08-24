import { describe, expect, test } from "vitest";

import registerGsExtension, {
	buildAutobranchRecoveryPrompt,
	parseGsAutobranchRouterArgs,
	type GsExtensionAPI,
} from "../src/extension.ts";
import type { EffectiveSkillInfo } from "@nseng-ai/pi-runtime/runtime/extension-types";
import { gsAutobranchEnvelopeSchema } from "@nseng-ai/gs/api";

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
class Host implements GsExtensionAPI {
	readonly commands = new Map<string, Parameters<GsExtensionAPI["registerCommand"]>[1]>();
	readonly messages: string[] = [];
	registerCommand(name: string, command: Parameters<GsExtensionAPI["registerCommand"]>[1]): void {
		this.commands.set(name, command);
	}
	sendUserMessage(content: string): void {
		this.messages.push(content);
	}
}
function skill(): EffectiveSkillInfo {
	return {
		name: "ns-gs-autobranch",
		filePath: "/skills/ns-gs-autobranch/SKILL.md",
		baseDir: "/skills/ns-gs-autobranch",
	};
}
function envelope(
	outcome: typeof data.outcome | "ambiguous-failure" | "refused" | "completed" = data.outcome,
) {
	return outcome === "completed"
		? {
				status: "success",
				exitCode: 0,
				data: { ...data, outcome, recovery: { action: "none", instruction: "Continue." } },
			}
		: {
				status: "negative",
				exitCode: 1,
				message: outcome === "refused" ? "refused" : "recover",
				data: { ...data, outcome },
			};
}
async function run(output = envelope(), args = "--slug add-child preserve this context") {
	const host = new Host();
	const calls: string[][] = [];
	const notifications: Array<{ message: string; level?: string }> = [];
	registerGsExtension(host, {
		readSkillTextFile: async () => "---\nname: ns-gs-autobranch\n---\nRecover forward.",
		runCli: async (argv, deps) => {
			calls.push([...argv]);
			deps.stdout(JSON.stringify(output));
			return output.exitCode;
		},
	});
	const command = host.commands.get("ns:gs:autobranch");
	if (command === undefined) throw new Error("not registered");
	await command.handler(args, {
		cwd: "/repo",
		ui: {
			notify: (message, level) =>
				notifications.push({ message, ...(level === undefined ? {} : { level }) }),
		},
		getSystemPromptOptions: () => ({ skills: [skill()] }),
		waitForIdle: async () => {},
	});
	return { host, calls, notifications };
}

describe("GS Pi autobranch router", () => {
	test("parses only slug and preserves remaining context", () => {
		expect(parseGsAutobranchRouterArgs("inspect --force --slug add-child do not replay")).toEqual({
			slug: "add-child",
			recoveryContext: "inspect --force do not replay",
		});
	});
	test("invokes fresh authorized JSON CLI and hands partial recovery to captured skill", async () => {
		const state = await run();
		expect(state.calls).toEqual([
			["gs", "autobranch", "--format", "json", "--yes", "--slug", "add-child"],
		]);
		expect(state.host.messages[0]).toContain("Recover forward.");
		expect(state.host.messages[0]).toContain("preserve this context");
		expect(state.host.messages[0]).toContain("Do not replay");
	});
	test("returns on completion without LM and reports refusal without LM", async () => {
		const completed = await run(envelope("completed"));
		expect(completed.host.messages).toEqual([]);
		const refused = await run(envelope("refused"));
		expect(refused.host.messages).toEqual([]);
		expect(refused.notifications.at(-1)?.level).toBe("error");
	});
	test("builds evidence-first recovery prompt", () => {
		const prompt = buildAutobranchRecoveryPrompt(
			"<skill />",
			gsAutobranchEnvelopeSchema.parse(envelope()),
			"inspect only",
		);
		expect(prompt).toContain("authoritative");
		expect(prompt).toContain("Do not replay");
		expect(prompt).toContain("inspect only");
	});
});
