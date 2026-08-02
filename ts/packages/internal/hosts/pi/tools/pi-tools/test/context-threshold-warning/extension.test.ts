import type { AgentSettledEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, test } from "vitest";

import {
	registerContextThresholdWarningHost,
	type ContextThresholdWarningContext,
} from "../../src/context-threshold-warning/extension.ts";

type SettledHandler = (
	event: AgentSettledEvent,
	context: ContextThresholdWarningContext,
) => Promise<void> | void;

class FakePi {
	readonly registeredEvents: string[] = [];
	settledHandler: SettledHandler | undefined;

	on(event: "agent_settled", handler: SettledHandler): void {
		this.registeredEvents.push(event);
		this.settledHandler = handler;
	}
}

class FakeContext {
	hasUI = true;
	tokens: number | null | undefined;
	readonly selections: Array<{ title: string; options: string[] }> = [];
	compactCalls = 0;
	selectError: Error | undefined;

	getContextUsage():
		| { tokens: number | null; contextWindow: number; percent: number | null }
		| undefined {
		if (this.tokens === undefined) return undefined;
		return { tokens: this.tokens, contextWindow: 1_200_000, percent: null };
	}

	compact(): void {
		this.compactCalls += 1;
	}

	readonly ui = {
		select: async (title: string, options: string[]) => {
			this.selections.push({ title, options: [...options] });
			if (this.selectError !== undefined) throw this.selectError;
			return options[0];
		},
	};
}

function setup(): { pi: FakePi; context: FakeContext; settle: () => Promise<void> } {
	const pi = new FakePi();
	const context = new FakeContext();
	registerContextThresholdWarningHost(pi);
	return {
		pi,
		context,
		settle: async () => {
			expect(pi.settledHandler).toBeDefined();
			if (pi.settledHandler === undefined) return;
			await pi.settledHandler({ type: "agent_settled" }, context);
		},
	};
}

describe("context threshold warning extension", () => {
	test("registers only for agent_settled", () => {
		const { pi } = setup();
		expect(pi.registeredEvents).toEqual(["agent_settled"]);
	});

	test("does not prompt or advance state without usable UI and usage", async () => {
		const { context, settle } = setup();
		context.hasUI = false;
		context.tokens = 250_000;
		await settle();
		context.hasUI = true;
		context.tokens = undefined;
		await settle();
		context.tokens = null;
		await settle();
		expect(context.selections).toEqual([]);

		context.tokens = 250_000;
		await settle();
		expect(context.selections).toHaveLength(1);
	});

	test("prompts once with current usage, threshold, and one acknowledgment option", async () => {
		const { context, settle } = setup();
		context.tokens = 250_000;
		await settle();

		expect(context.selections).toEqual([
			{
				title: "Context usage is 250,000 tokens; crossed the 200,000-token threshold",
				options: ["Acknowledge"],
			},
		]);
	});

	test("selects only the highest threshold for jumps and does not repeat it", async () => {
		const { context, settle } = setup();
		context.tokens = 150_000;
		await settle();
		context.tokens = 650_000;
		await settle();
		context.tokens = 700_000;
		await settle();

		expect(context.selections).toHaveLength(1);
		expect(context.selections[0]?.title).toContain("600,000-token");
	});

	test("prompts again after a drop and recross", async () => {
		const { context, settle } = setup();
		for (const tokens of [450_000, 350_000, 450_000]) {
			context.tokens = tokens;
			await settle();
		}

		expect(context.selections.map((selection) => selection.title)).toEqual([
			"Context usage is 450,000 tokens; crossed the 400,000-token threshold",
			"Context usage is 450,000 tokens; crossed the 400,000-token threshold",
		]);
	});

	test("keeps dialog failures local after handling the crossing", async () => {
		const { context, settle } = setup();
		context.tokens = 250_000;
		context.selectError = new Error("dialog unavailable");
		await expect(settle()).resolves.toBeUndefined();

		context.selectError = undefined;
		await settle();
		expect(context.selections).toHaveLength(1);
	});

	test("does not compact or expose message injection capabilities", async () => {
		const { context, settle } = setup();
		context.tokens = 250_000;
		await settle();

		expect(context.compactCalls).toBe(0);
		expect("sendMessage" in context).toBe(false);
		expect("sendUserMessage" in context).toBe(false);
		expect("appendEntry" in context).toBe(false);
	});
});
