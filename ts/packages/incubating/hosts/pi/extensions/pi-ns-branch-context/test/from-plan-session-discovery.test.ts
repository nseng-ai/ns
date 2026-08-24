import { access, readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { formatImplBranchContextCommand } from "@nseng-ai/branch-context/api";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import registerBranchContextExtension from "../src/extension.ts";
import type {
	SessionPlanDiscoveryProcessGateway,
	SessionPlanDiscoveryProcessRequest,
} from "../src/session-plan-discovery.ts";
import {
	DEFAULT_PLAN_CONTENT,
	FakePi,
	PLAN_KEY,
	PLAN_SLUG,
	ROOT,
	branchContextExtensionTestOptions,
	createBranchContextOperationFakes,
	createContext,
	gitCheckoutStep,
	gitRootStep,
	makeNamedPlanFile,
	planSlugStep,
} from "./branch-context-extension-support.ts";

const MODEL_POLICY = `[models.profiles.fast]
model = "openai-codex/gpt-5.6-luna"
thinking = "minimal"
[models.profiles.discovery]
model = "openai-codex/gpt-5.6-luna"
thinking = "minimal"
[models.operations]
"plans.session-discovery" = "discovery"
`;
const SKILL = {
	name: "session-plan-discovery",
	filePath: "/skills/session-plan-discovery/SKILL.md",
	baseDir: "/skills/session-plan-discovery",
};

function modelPolicy(): ProjectConfigGateway {
	return {
		readTextFile: () => ({ type: "found", text: MODEL_POLICY }),
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
			code: 0,
			stdout: JSON.stringify(this.value),
			stderr: "",
		};
	}
}

function candidate(filePath: string) {
	return {
		type: "saved-plan-reference" as const,
		filePath,
		basis: "The session explicitly selected this Saved Plan.",
		evidence: [`Selected Saved Plan: ${filePath}`],
	};
}

describe("no-path session plan discovery", () => {
	test.each([
		"ns:branch-context:from-plan",
		"ns:branch-context:upstack-impl-from-plan",
		"ns:plan:impl-saved-plan",
	])("%s dry-run discovers and reports evidence without confirmation or mutation", async (name) => {
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: "# Presented plan\n",
			suggestedSlug: "implement-presented-session-plan",
			basis: "The session presents an authoritative plan.",
			evidence: ["Authoritative plan follows."],
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			hasUI: false,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => {
				throw new Error("dry-run must not confirm");
			},
			select: async () => undefined,
		});

		await pi.commands.get(name)?.handler("--dry-run", context.ctx);

		expect(process.calls).toHaveLength(1);
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages.at(-1)?.content).toContain("Candidate: presented-plan");
		expect(pi.sentMessages.at(-1)?.content).toContain("Confirmation needed: yes");
	});

	test("--yes fails before discovery and non-reference discovery requires confirmation", async () => {
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: "# Presented plan\n",
			suggestedSlug: "presented-plan",
			basis: "The session presents an authoritative plan.",
			evidence: ["Authoritative plan follows."],
		});
		const fakes = createBranchContextOperationFakes();
		const pi = new FakePi();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		await pi.commands
			.get("ns:branch-context:from-plan")
			?.handler("--yes", createContext([], { sessionFile: "/s", skills: [SKILL] }).ctx);
		expect(pi.sentMessages.at(-1)?.content).toContain("cannot approve semantic");
		await pi.commands
			.get("ns:branch-context:from-plan")
			?.handler("", createContext([], { hasUI: false, sessionFile: "/s", skills: [SKILL] }).ctx);
		expect(pi.sentMessages.at(-1)?.content).toContain("requires Pi UI confirmation");
		await pi.commands
			.get("ns:branch-context:from-plan")
			?.handler("", createContext([], { skills: [SKILL], confirm: async () => true }).ctx);
		expect(pi.sentMessages.at(-1)?.content).toContain("not persisted");
		expect(process.calls).toHaveLength(1);
	});

	test.each([
		"ns:branch-context:from-plan",
		"ns:branch-context:upstack-impl-from-plan",
		"ns:plan:impl-saved-plan",
	])("%s uses a sole validated Saved Plan reference without confirmation", async (name) => {
		const filePath = await makeNamedPlanFile();
		const process = new DiscoveryProcess(candidate(filePath));
		const pi = new FakePi([
			gitRootStep(),
			planSlugStep(DEFAULT_PLAN_CONTENT),
			gitCheckoutStep(PLAN_SLUG),
		]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			hasUI: false,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => {
				throw new Error("a sole validated Saved Plan reference must not require confirmation");
			},
		});

		await pi.commands.get(name)?.handler("", context.ctx);

		expect(fakes.resolveExplicitPlanCalls[0]?.[1]).toMatchObject({ explicitPath: filePath });
		if (name === "ns:plan:impl-saved-plan") {
			expect(context.replacementUserMessages[0]).toContain(filePath);
		} else {
			expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ filePath });
		}
	});

	test("a Saved Plan reference preview contains only its path", async () => {
		const filePath = await makeNamedPlanFile();
		const process = new DiscoveryProcess(candidate(filePath));
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});

		await pi.commands
			.get("ns:branch-context:from-plan")
			?.handler(
				"--dry-run",
				createContext([], { hasUI: false, sessionFile: "/s", skills: [SKILL] }).ctx,
			);

		const message = String(pi.sentMessages.at(-1)?.content);
		expect(message).toContain(filePath);
		expect(message).not.toContain("Candidate:");
		expect(message).not.toContain("Basis:");
		expect(message).not.toContain("Evidence:");
	});

	test("plan-ready confirms, injects normal plan save, and stops without mutation", async () => {
		const process = new DiscoveryProcess({
			type: "plan-ready",
			focus: "Write the settled discovery implementation plan.",
			basis: "All material decisions are settled.",
			missingElements: ["Order the implementation steps."],
			evidence: ["No material product questions remain."],
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => true,
			select: async () => undefined,
		});

		await pi.commands.get("ns:plan:impl-saved-plan")?.handler("", context.ctx);

		expect(pi.sentUserMessages[0]).toContain("/ns:plan:save");
		expect(pi.sentUserMessages[0]).toContain("Write the settled discovery implementation plan.");
		expect(pi.sentUserMessageOptions[0]).toEqual({ deliverAs: "followUp" });
		expect(fakes.createBranchCalls).toEqual([]);
		expect(context.wasSessionReplaced()).toBe(false);
	});

	test("ambiguous dry-run reports candidates without selection or confirmation", async () => {
		const process = new DiscoveryProcess({
			type: "ambiguous",
			basis: "Two plans remain plausible.",
			candidates: [
				{
					type: "plan-ready",
					focus: "First focus.",
					basis: "First basis.",
					missingElements: [],
					evidence: ["First evidence."],
				},
				{
					type: "plan-ready",
					focus: "Second focus.",
					basis: "Second basis.",
					missingElements: [],
					evidence: ["Second evidence."],
				},
			],
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});

		await pi.commands.get("ns:branch-context:from-plan")?.handler(
			"--dry-run",
			createContext([], {
				hasUI: false,
				sessionFile: "/sessions/current.jsonl",
				skills: [SKILL],
				select: async () => {
					throw new Error("ambiguous dry-run must not select");
				},
			}).ctx,
		);

		expect(pi.sentMessages.at(-1)?.content).toContain("ambiguous");
		expect(pi.sentMessages.at(-1)?.content).toContain("First focus.");
		expect(pi.sentMessages.at(-1)?.content).toContain("Second focus.");
		expect(fakes.createBranchCalls).toEqual([]);
	});

	test("ambiguous discovery selects a typed candidate before final confirmation", async () => {
		const process = new DiscoveryProcess({
			type: "ambiguous",
			basis: "Two distinct plan-ready focuses remain.",
			candidates: [
				{
					type: "plan-ready",
					focus: "First focus.",
					basis: "First basis.",
					missingElements: [],
					evidence: ["First evidence."],
				},
				{
					type: "plan-ready",
					focus: "Second focus.",
					basis: "Second basis.",
					missingElements: [],
					evidence: ["Second evidence."],
				},
			],
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async (_title, message) => message?.includes("Second focus.") === true,
			select: async (_title, items) => items[1],
		});

		await pi.commands.get("ns:plan:impl-saved-plan")?.handler("", context.ctx);

		expect(pi.sentUserMessages[0]).toContain("Second focus.");
		expect(pi.sentUserMessages[0]).not.toContain("First focus.");
	});

	test.each([
		"ns:branch-context:from-plan",
		"ns:branch-context:upstack-impl-from-plan",
		"ns:plan:impl-saved-plan",
	])("%s cancellation stops before downstream mutation", async (name) => {
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: "# Presented plan\n",
			suggestedSlug: "presented-plan",
			basis: "The session presents an authoritative plan.",
			evidence: ["Authoritative plan follows."],
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => false,
		});

		await pi.commands.get(name)?.handler("", context.ctx);

		expect(fakes.createBranchCalls).toEqual([]);
		expect(context.wasSessionReplaced()).toBe(false);
		expect(pi.sentMessages.at(-1)?.content).toContain("cancelled");
	});

	test("not-found stops without a latest fallback", async () => {
		const process = new DiscoveryProcess({
			type: "not-found",
			reason: "No actionable plan appears in the persisted session.",
		});
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});

		await pi.commands.get("ns:branch-context:from-plan")?.handler(
			"",
			createContext([], {
				sessionFile: "/sessions/current.jsonl",
				skills: [SKILL],
				confirm: async () => true,
			}).ctx,
		);

		expect(fakes.selectPlanCalls).toEqual([]);
		expect(fakes.createBranchCalls).toEqual([]);
		expect(pi.sentMessages.at(-1)?.content).toContain("found no actionable plan");
	});

	test.each(["missing", "outside-store", "stale"])(
		"rejects an invalid discovered Saved Plan reference (%s)",
		async (reason) => {
			const process = new DiscoveryProcess(candidate(`/plans/${reason}.md`));
			const pi = new FakePi([gitRootStep()]);
			const fakes = createBranchContextOperationFakes({
				async resolveExplicitSavedPlanFile() {
					return { type: "unsafe", message: `${reason} discovered reference` };
				},
			});
			registerBranchContextExtension(pi, {
				...branchContextExtensionTestOptions(fakes.operations),
				sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
			});

			await pi.commands.get("ns:branch-context:from-plan")?.handler(
				"",
				createContext([], {
					sessionFile: "/sessions/current.jsonl",
					skills: [SKILL],
					confirm: async () => {
						throw new Error("unsafe references must fail before confirmation");
					},
				}).ctx,
			);

			expect(fakes.createBranchCalls).toEqual([]);
			expect(pi.sentMessages.at(-1)?.content).toContain("not safe");
		},
	);

	test("persists exact presented-plan content through the CLI envelope before creation", async () => {
		const markdown = "# Exact presented plan\n\n- Preserve this content byte-for-byte.\n";
		const savedPath = await makeNamedPlanFile("exact-presented-plan.md");
		const process = new DiscoveryProcess({
			type: "presented-plan",
			planMarkdown: markdown,
			suggestedSlug: "exact-presented-plan",
			basis: "The session presented this exact plan.",
			evidence: ["The user accepted the presented plan."],
		});
		let stagedContent = "";
		let stagedPath = "";
		class PresentedPlanPi extends FakePi {
			override async exec(
				command: string,
				args: string[],
				options?: Parameters<FakePi["exec"]>[2],
			) {
				if (command !== "enriched-plan") return super.exec(command, args, options);
				const contentIndex = args.indexOf("--content-file") + 1;
				stagedPath = args[contentIndex] ?? "";
				stagedContent = await readFile(stagedPath, "utf8");
				return {
					stdout: JSON.stringify({
						status: "ok",
						exitCode: 0,
						data: {
							format: "timestamped",
							slug: "exact-presented-plan",
							filePath: savedPath,
							fileName: "exact-presented-plan--26-01-02T03-04-05--1.md",
							fileStem: "exact-presented-plan--26-01-02T03-04-05--1",
							timestamp: "26-01-02T03-04-05",
							timestampNumber: 1_767_322_800_000,
							sequence: 1,
							repoRoot: ROOT,
							repoKey: "gh--owner--repo",
							repoIdentitySource: "origin-url",
							sourceBranch: "source-branch",
							branchKey: "source-branch",
							directoryPath: "/plans",
						},
					}),
					stderr: "",
					code: 0,
					killed: false,
				};
			}
		}
		const pi = new PresentedPlanPi([gitRootStep(), planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});

		await pi.commands.get("ns:branch-context:from-plan")?.handler(
			"",
			createContext([], {
				sessionFile: "/sessions/current.jsonl",
				skills: [SKILL],
				confirm: async () => true,
			}).ctx,
		);

		expect(stagedContent).toBe(markdown);
		expect(fakes.createBranchCalls[0]?.[1], String(pi.sentMessages.at(-1)?.content)).toMatchObject({
			filePath: savedPath,
		});
		await expect(access(stagedPath)).rejects.toThrow();
	});

	test("confirmed discovery preserves upstack branch creation, checkout, and launch", async () => {
		const filePath = await makeNamedPlanFile();
		const process = new DiscoveryProcess(candidate(filePath));
		const pi = new FakePi([
			gitRootStep(),
			planSlugStep(DEFAULT_PLAN_CONTENT),
			gitCheckoutStep(PLAN_SLUG),
		]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => true,
		});

		await pi.commands.get("ns:branch-context:upstack-impl-from-plan")?.handler("", context.ctx);

		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({
			filePath,
			creation: { type: "graphite-current-parent-current-head" },
		});
		expect(context.replacementUserMessages).toEqual([formatImplBranchContextCommand(PLAN_KEY)]);
		expect(context.wasSessionReplaced()).toBe(true);
	});

	test("confirmed discovery preserves current-branch Saved Plan launch", async () => {
		const filePath = await makeNamedPlanFile();
		const process = new DiscoveryProcess(candidate(filePath));
		const pi = new FakePi([gitRootStep()]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => true,
		});

		await pi.commands.get("ns:plan:impl-saved-plan")?.handler("", context.ctx);

		expect(fakes.createBranchCalls).toEqual([]);
		expect(context.replacementUserMessages[0]).toContain(filePath);
		expect(context.wasSessionReplaced()).toBe(true);
	});

	test("validates a discovered Saved Plan before confirmation and continues normal creation", async () => {
		const filePath = await makeNamedPlanFile();
		const process = new DiscoveryProcess(candidate(filePath));
		const pi = new FakePi([gitRootStep(), planSlugStep(DEFAULT_PLAN_CONTENT)]);
		const fakes = createBranchContextOperationFakes();
		registerBranchContextExtension(pi, {
			...branchContextExtensionTestOptions(fakes.operations),
			sessionPlanDiscovery: { modelPolicy: modelPolicy(), process },
		});
		const context = createContext([], {
			cwd: ROOT,
			sessionFile: "/sessions/current.jsonl",
			skills: [SKILL],
			confirm: async () => true,
			select: async () => undefined,
		});

		await pi.commands.get("ns:branch-context:from-plan")?.handler("", context.ctx);

		expect(fakes.resolveExplicitPlanCalls[0]?.[1]).toMatchObject({ explicitPath: filePath });
		expect(fakes.createBranchCalls[0]?.[1]).toMatchObject({ filePath });
	});
});
