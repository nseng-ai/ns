import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import registerBranchContextExtension, {
	type BranchContextOperations,
	type CommandContext,
	type ToolDefinition,
} from "@nseng-ai/pi-ns-branch-context/extension";
import {
	GRILL_ASK_ROUND_TOOL_NAME,
	evaluateGrillAttempt,
	formatGrillKickoffMarker,
	type GrillRoundResultEvidence,
} from "@nseng-ai/pi-runtime/grill/surfaces";

import { registerGrillUiExtension } from "../../src/grill/extension.ts";

const WRITE_TOOL_NAME = "write_saved_plan_file";
const ROOT = resolve(import.meta.dirname, "../../../../../../../../..");

type RegisteredCommand = {
	description?: string;
	handler(args: string, ctx: never): Promise<void> | void;
};
type GrillExtensionAPI = Parameters<typeof registerGrillUiExtension>[0];
type GrillToolDefinition = Parameters<GrillExtensionAPI["registerTool"]>[0];
type RegisteredTool = GrillToolDefinition | ToolDefinition;

class CombinedFakePi {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly tools = new Map<string, RegisteredTool>();
	readonly sentUserMessages: string[] = [];
	readonly events: string[] = [];
	readonly execCalls: string[] = [];
	private activeTools: string[] = [];
	private readonly lifecycleHandlers: Array<() => void> = [];

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	registerTool(definition: RegisteredTool): void {
		this.tools.set(definition.name, definition);
	}

	getActiveTools(): string[] {
		return [...this.activeTools];
	}

	setActiveTools(names: string[]): void {
		this.events.push(`active:${names.join(",")}`);
		this.activeTools.splice(0, this.activeTools.length, ...names);
	}

	on(_event: "session_start", handler: () => void): void {
		this.lifecycleHandlers.push(handler);
	}

	async exec(
		command: string,
		args: string[],
	): Promise<{ stdout: string; stderr: string; code: number; killed: boolean }> {
		this.execCalls.push(`${command} ${args.join(" ")}`);
		const stdout =
			command === "git" && args.join(" ") === "rev-parse --show-toplevel"
				? `${ROOT}\n`
				: "durable-branch-context-storage\n";
		return { stdout, stderr: "", code: 0, killed: false };
	}

	sendUserMessage(content: string): void {
		this.events.push("send");
		this.sentUserMessages.push(content);
	}
}

function commandContext(): CommandContext {
	return {
		cwd: ROOT,
		hasUI: false,
		ui: {
			notify(): void {},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {},
		async newSession(): Promise<{ cancelled: boolean }> {
			return { cancelled: true };
		},
	};
}

function kickoff(kind: "saved-plan" | "general" = "saved-plan"): unknown {
	return {
		type: "message",
		message: {
			role: "user",
			content: formatGrillKickoffMarker({
				version: 1,
				attemptId: `${kind}-matrix-attempt`,
				policy:
					kind === "saved-plan"
						? { kind: "saved-plan", maxDecisionRounds: 5 }
						: { kind: "general" },
			}),
		},
	};
}

function result(details: GrillRoundResultEvidence): unknown {
	return {
		type: "message",
		message: { role: "toolResult", toolName: GRILL_ASK_ROUND_TOOL_NAME, details },
	};
}

function submitted(index: number): GrillRoundResultEvidence {
	return {
		action: "submitted",
		mode: "decision-round",
		roundId: `round-${index}`,
		answers: [
			{
				questionId: `question-${index}`,
				kind: "option",
				value: "recommended",
				label: "Recommended",
				recommendation: "retained",
			},
		],
		submittedRoundCount: index,
		answeredDecisionCount: index,
	};
}

function decisionRound(index: number): unknown {
	return {
		mode: "decision-round",
		roundId: `round-${index}`,
		questions: [
			{
				id: `question-${index}`,
				question: "Choose the Saved Plan policy?",
				options: [
					{ value: "recommended", label: "Use the recommended policy" },
					{ value: "alternative", label: "Use the alternative policy" },
				],
				recommendedOptionValue: "recommended",
				recommendationRationale: "It preserves the contract.",
			},
		],
	};
}

describe("combined grill and Branch Context fake host", () => {
	test("shares atomic-round activation and Saved Plan attempt history", async () => {
		const writeCalls: unknown[] = [];
		const operations: BranchContextOperations = {
			async writeSavedPlanFile(...args) {
				writeCalls.push(args);
				return {
					slug: "combined-saved-plan",
					repoRoot: ROOT,
					repoKey: "repo",
					repoIdentitySource: "origin-url",
					sourceBranch: "feature",
					branchKey: "feature",
					filePath: "/plans/combined-saved-plan.md",
				};
			},
			async loadBranchContextPlan() {
				throw new Error("not used");
			},
			async createBranchContextFromFile() {
				throw new Error("not used");
			},
			async resolveSelectedSavedPlanFile() {
				throw new Error("not used");
			},
		};
		const pi = new CombinedFakePi();
		registerGrillUiExtension(pi);
		registerBranchContextExtension(pi, { branchContextOperations: operations });

		expect([...pi.tools.keys()].sort()).toEqual([GRILL_ASK_ROUND_TOOL_NAME, WRITE_TOOL_NAME]);
		const command = pi.commands.get("ns:plan:grill-and-save");
		expect(command).toBeDefined();
		await command?.handler("combined protocol", commandContext() as never);
		expect(pi.getActiveTools()).toEqual([GRILL_ASK_ROUND_TOOL_NAME]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain('"kind":"saved-plan","maxDecisionRounds":5');

		const writeTool = pi.tools.get(WRITE_TOOL_NAME) as ToolDefinition;
		const deniedHistories: Array<[string, unknown[]]> = [
			["missing", []],
			[
				"malformed",
				[
					{
						type: "message",
						message: { role: "user", content: "<ns-grill-kickoff>{oops}</ns-grill-kickoff>" },
					},
				],
			],
			["general", [kickoff("general"), result({ action: "confirmed", mode: "confirmation" })]],
			["unconfirmed", [kickoff()]],
			[
				"cancel",
				[kickoff(), result({ action: "cancelled", mode: "decision-round", roundId: "cancel" })],
			],
			["end", [kickoff(), result({ action: "ended", mode: "decision-round", roundId: "end" })]],
			[
				"UI failure",
				[kickoff(), result({ action: "ui-failed", mode: "decision-round", roundId: "ui" })],
			],
			["invalid", [kickoff(), result({ action: "invalid-tool-input", errors: ["invalid"] })]],
		];
		for (const [label, deniedHistory] of deniedHistories) {
			await expect(
				writeTool.execute(`write-${label}`, { content: "# Denied\n" }, undefined, undefined, {
					cwd: ROOT,
					hasUI: false,
					sessionManager: { getBranch: () => deniedHistory },
				}),
			).rejects.toThrow("requires an explicitly confirmed current Saved Plan grill attempt");
		}
		expect(pi.execCalls).toEqual([]);
		expect(writeCalls).toEqual([]);

		const history: unknown[] = [
			{ type: "message", message: { role: "user", content: pi.sentUserMessages[0] } },
		];
		for (let index = 1; index <= 5; index += 1) history.push(result(submitted(index)));
		const excludedResults: GrillRoundResultEvidence[] = [
			{ action: "cancelled", mode: "decision-round", roundId: "cancelled" },
			{ action: "invalid-tool-input", errors: ["invalid"] },
			{ action: "confirmed", mode: "confirmation" },
		];
		for (const excluded of excludedResults) {
			const evaluation = evaluateGrillAttempt([...history, result(excluded)]);
			expect(evaluation.submittedRoundCount).toBe(5);
			expect(evaluation.answeredDecisionCount).toBe(5);
		}

		const roundTool = pi.tools.get(GRILL_ASK_ROUND_TOOL_NAME) as GrillToolDefinition;
		const sixth = await roundTool.execute("sixth", decisionRound(6), undefined, undefined, {
			hasUI: false,
			ui: {},
			sessionManager: { getBranch: () => history },
		});
		expect(sixth.details).toMatchObject({ action: "cap-exhausted" });
		history.push(result(sixth.details as GrillRoundResultEvidence));
		const confirmation = await roundTool.execute(
			"confirmation",
			{ mode: "confirmation", summary: "Shared understanding" },
			undefined,
			undefined,
			{ hasUI: false, ui: {}, sessionManager: { getBranch: () => history } },
		);
		expect(confirmation.details).toMatchObject({ action: "ui-failed" });

		await expect(
			writeTool.execute("write", { content: "# Denied\n" }, undefined, undefined, {
				cwd: ROOT,
				hasUI: false,
				sessionManager: { getBranch: () => history },
			}),
		).rejects.toThrow("latest status is cap-exhausted");
		expect(pi.execCalls).toEqual([]);
		expect(writeCalls).toEqual([]);

		await command?.handler("fresh attempt", commandContext() as never);
		history.push({
			type: "message",
			message: { role: "user", content: pi.sentUserMessages.at(-1) },
		});
		history.push(result({ action: "confirmed", mode: "confirmation" }));
		expect(evaluateGrillAttempt(history)).toMatchObject({
			status: "confirmed",
			authorized: true,
		});
		await writeTool.execute("write-confirmed", { content: "# Confirmed\n" }, undefined, undefined, {
			cwd: ROOT,
			hasUI: false,
			sessionManager: { getBranch: () => history },
		});
		expect(pi.execCalls.some((call) => call.startsWith("pi "))).toBe(true);
		expect(writeCalls).toHaveLength(1);
	});
});
