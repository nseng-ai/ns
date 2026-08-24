import { describe, expect, test } from "vitest";

import type {
	SessionPlanDiscoveryProcessGateway,
	SessionPlanDiscoveryProcessRequest,
} from "@nseng-ai/pi-ns-branch-context/session-plan-discovery";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import { handleHerdrSlotImplPlan } from "../src/core/impl-plan.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	ROOT,
	notificationMessages,
} from "./herdr-test-harness.ts";

const SKILL = {
	name: "session-plan-discovery",
	filePath: "/skills/session-plan-discovery/SKILL.md",
	baseDir: "/skills/session-plan-discovery",
};

function modelPolicy(): ProjectConfigGateway {
	return {
		readTextFile: () => ({
			type: "found",
			text: `[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n[models.profiles.discovery]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n[models.operations]\n"plans.session-discovery" = "discovery"\n`,
		}),
		pathExists: () => ({ type: "present" }),
	};
}

class DiscoveryProcess implements SessionPlanDiscoveryProcessGateway {
	readonly calls: SessionPlanDiscoveryProcessRequest[] = [];
	private readonly value: unknown;

	constructor(value: unknown) {
		this.value = value;
	}

	async run(request: SessionPlanDiscoveryProcessRequest) {
		this.calls.push(request);
		return {
			type: "exited" as const,
			stdout: JSON.stringify(this.value),
			stderr: "",
			code: 0,
		};
	}
}

function context(pi: FakePi, command: FakeCommandContext, herdr: FakeHerdrGateway) {
	return {
		commands: createHerdrPiCommandApi(pi),
		git: new InMemoryGitGateway({ currentBranch: "source" }),
		herdr,
		pi: command,
	};
}

const config = {
	commandName: "ns:herdr:impl:plan:space",
	statusKey: "ns:herdr:impl:plan:space",
	destination: "workspace" as const,
};

describe("Herdr persisted-session plan discovery", () => {
	test("dry-run discovers and reports without confirmation, saving, or destination mutation", async () => {
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: "# Exact presented plan\n",
			suggestedSlug: "exact-presented-plan",
			basis: "The session presented this plan.",
			evidence: ["The user accepted the plan."],
		});
		const pi = new FakePi();
		const command = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirmValues: [false],
		});
		const herdr = new FakeHerdrGateway();

		await handleHerdrSlotImplPlan(context(pi, command, herdr), {
			rawArgs: "--dry-run",
			dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
			config,
			notifyProgress: () => {},
		});

		expect(process.calls, notificationMessages(command).join("\n")).toHaveLength(1);
		expect(command.confirmations).toEqual([]);
		expect(command.selections).toEqual([]);
		expect(pi.execCalls.map((call) => call.command)).toEqual(["git"]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(command).join("\n")).toContain("Candidate: presented-plan");
		expect(notificationMessages(command).join("\n")).toContain("Confirmation needed: yes");
	});

	test.each([
		{ destination: "workspace" as const, commandName: "ns:herdr:impl:plan:space" },
		{ destination: "tab" as const, commandName: "ns:herdr:impl:plan:tab" },
	])("$commandName cancellation occurs before branch or destination mutation", async (scenario) => {
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: "# Presented plan\n",
			suggestedSlug: "presented-plan",
			basis: "The session presented this plan.",
			evidence: ["The plan was accepted."],
		});
		const pi = new FakePi();
		const command = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirmValues: [false],
		});
		const herdr = new FakeHerdrGateway();
		const git = new InMemoryGitGateway({ currentBranch: "source" });

		await handleHerdrSlotImplPlan(
			{ commands: createHerdrPiCommandApi(pi), git, herdr, pi: command },
			{
				rawArgs: "",
				dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
				config: {
					commandName: scenario.commandName,
					statusKey: scenario.commandName,
					destination: scenario.destination,
				},
				notifyProgress: () => {},
			},
		);

		expect(command.confirmations).toHaveLength(1);
		expect(git.currentBranchCalls).toEqual([]);
		expect(pi.execCalls.map((call) => call.command)).toEqual(["git"]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(command).join("\n")).toContain("cancelled");
	});

	test("ambiguous tab discovery cancellation stops before branch, Slot, or tab mutation", async () => {
		const process = new DiscoveryProcess({
			type: "ambiguous",
			basis: "Two plans remain plausible.",
			candidates: [
				{
					type: "plan-ready",
					focus: "First plan.",
					basis: "First basis.",
					missingElements: [],
					evidence: ["First evidence."],
				},
				{
					type: "plan-ready",
					focus: "Second plan.",
					basis: "Second basis.",
					missingElements: [],
					evidence: ["Second evidence."],
				},
			],
		});
		const pi = new FakePi();
		const command = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			shouldCancelSelect: true,
		});
		const herdr = new FakeHerdrGateway();

		await handleHerdrSlotImplPlan(context(pi, command, herdr), {
			rawArgs: "",
			dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
			config: { ...config, commandName: "ns:herdr:impl:plan:tab", destination: "tab" },
			notifyProgress: () => {},
		});

		expect(command.selections).toHaveLength(1);
		expect(command.confirmations).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(herdr.createTabCalls).toEqual([]);
		expect(notificationMessages(command).join("\n")).toContain("cancelled");
	});

	test("ephemeral and non-UI sessions fail closed before discovery", async () => {
		const process = new DiscoveryProcess({ type: "not-found", reason: "No plan." });
		const pi = new FakePi();
		const ephemeral = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: null,
			skills: [SKILL],
		});
		await handleHerdrSlotImplPlan(context(pi, ephemeral, new FakeHerdrGateway()), {
			rawArgs: "",
			dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
			config,
			notifyProgress: () => {},
		});
		expect(notificationMessages(ephemeral).join("\n")).toContain("not persisted");

		const noUi = new FakeCommandContext({
			cwd: ROOT,
			hasUI: false,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
		});
		await handleHerdrSlotImplPlan(context(pi, noUi, new FakeHerdrGateway()), {
			rawArgs: "",
			dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
			config,
			notifyProgress: () => {},
		});
		expect(notificationMessages(noUi).join("\n")).toContain("requires Pi UI confirmation");
		expect(process.calls).toEqual([]);
		expect(pi.execCalls).toEqual([]);
	});

	test("plan-ready confirms, sends plan-save follow-up, and stops before branch selection", async () => {
		const process = new DiscoveryProcess({
			type: "plan-ready",
			focus: "Save the settled Herdr plan.",
			basis: "All decisions are settled.",
			missingElements: [],
			evidence: ["The plan is ready to write."],
		});
		const pi = new FakePi();
		const command = new FakeCommandContext({
			cwd: ROOT,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirmValues: [true],
		});
		const herdr = new FakeHerdrGateway();

		await handleHerdrSlotImplPlan(context(pi, command, herdr), {
			rawArgs: "",
			dependencies: { sessionPlanDiscovery: { modelPolicy: modelPolicy(), process } },
			config,
			notifyProgress: () => {},
		});

		expect(command.confirmations, notificationMessages(command).join("\n")).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("/ns:plan:save");
		expect(pi.sentUserMessages[0]).toContain("Save the settled Herdr plan.");
		expect(pi.sentUserMessageOptions[0]).toEqual({ deliverAs: "followUp" });
		expect(command.selections).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
	});
});
