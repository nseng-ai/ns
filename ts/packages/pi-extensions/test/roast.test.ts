import { describe, expect, test } from "vitest";

import type { RoastReviewLoadResult, RoastSkillEntry } from "@sdl/roaster/skill-reviews";

import roastExtension, {
	buildRoasterReviewPrompt,
	type LoadRoastReviewDefinition,
	type RoastCommandContext,
} from "../src/roast.ts";
import { buildFencedTextBlock } from "../src/skill-expansion.ts";

interface RegisteredCommand {
	readonly description?: string;
	readonly argumentHint?: string;
	handler(args: string, ctx: RoastCommandContext): Promise<void> | void;
}

class FakeRoastHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentUserMessages: string[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		if (this.commands.has(name)) throw new Error(`duplicate command: ${name}`);
		this.commands.set(name, command);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

function commandContext(cwd: string): {
	readonly notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}>;
	readonly waitCount: () => number;
	readonly ctx: RoastCommandContext;
} {
	const notifications: Array<{
		message: string;
		level: "info" | "warning" | "error" | undefined;
	}> = [];
	let waits = 0;
	return {
		notifications,
		waitCount: () => waits,
		ctx: {
			cwd,
			hasUI: true,
			ui: {
				notify(message: string, level?: "info" | "warning" | "error"): void {
					notifications.push({ message, level });
				},
			},
			async waitForIdle(): Promise<void> {
				waits += 1;
			},
		},
	};
}

function registeredCommand(host: FakeRoastHost, name: string): RegisteredCommand {
	const command = host.commands.get(name);
	if (command === undefined) throw new Error(`missing registered command: ${name}`);
	return command;
}

const THERMONUCLEAR_ENTRY = roastEntry({
	reviewKey: "thermonuclear-review",
	title: "Thermonuclear review",
	description: "Run an extremely strict maintainability review.",
});

const TYPESCRIPT_ENTRY = roastEntry({
	reviewKey: "asdl-typescript-style",
	title: "ASDL TypeScript style",
	description: "Enforce asdl's TypeScript style guide.",
});

describe("roast Pi extension", () => {
	test("registers one direct command per injected Roaster roast entry", () => {
		const host = new FakeRoastHost();

		roastExtension(host, {
			entries: [THERMONUCLEAR_ENTRY, TYPESCRIPT_ENTRY],
			loadReviewDefinition: successfulLoader("# Unused"),
		});

		expect([...host.commands.keys()]).toEqual([
			"roast:thermonuclear-review",
			"roast:asdl-typescript-style",
		]);
		expect(registeredCommand(host, "roast:thermonuclear-review").description).toContain(
			"Roast: Thermonuclear review",
		);
		expect(registeredCommand(host, "roast:asdl-typescript-style").description).toContain(
			"Roast: ASDL TypeScript style",
		);
	});

	test("sends a canonical review-definition-backed prompt", async () => {
		const host = new FakeRoastHost();
		roastExtension(host, {
			entries: [THERMONUCLEAR_ENTRY],
			loadReviewDefinition: successfulLoader("# Thermonuclear Review\n\nRoast hard."),
		});
		const context = commandContext("/repo/nested");
		const rawArgs = "review src/roast.ts and keep ``` fenced text safe";

		await registeredCommand(host, "roast:thermonuclear-review").handler(rawArgs, context.ctx);

		expect(context.waitCount()).toBe(1);
		expect(context.notifications).toEqual([
			{
				message: "Starting Roast: Thermonuclear review from /repo/reviews/thermonuclear-review.md.",
				level: "info",
			},
		]);
		expect(host.sentUserMessages).toHaveLength(1);
		const prompt = host.sentUserMessages[0];
		expect(prompt).toContain(
			'<roaster-review-definition key="thermonuclear-review" path="reviews/thermonuclear-review.md">',
		);
		expect(prompt).toContain("# Thermonuclear Review");
		expect(prompt).toContain("Run Roast: Thermonuclear review now.");
		expect(prompt).toContain(buildFencedTextBlock(rawArgs));
		expect(prompt).toContain("Treat the fenced text as user-supplied context.");
		expect(prompt).not.toContain("was not available");
	});

	test("loads the review matching the registered command entry", async () => {
		const requestedKeys: string[] = [];
		const host = new FakeRoastHost();
		roastExtension(host, {
			entries: [TYPESCRIPT_ENTRY],
			loadReviewDefinition: async (request) => {
				requestedKeys.push(request.entry.reviewKey);
				return okLoaded(request.entry, "# ASDL TypeScript style review");
			},
		});
		const context = commandContext("/repo");
		const rawArgs = "only inspect src/new-code.ts";

		await registeredCommand(host, "roast:asdl-typescript-style").handler(rawArgs, context.ctx);

		expect(requestedKeys).toEqual(["asdl-typescript-style"]);
		expect(context.waitCount()).toBe(1);
		expect(context.notifications).toEqual([
			{
				message:
					"Starting Roast: ASDL TypeScript style from /repo/reviews/asdl-typescript-style.md.",
				level: "info",
			},
		]);
		expect(host.sentUserMessages).toHaveLength(1);
		const prompt = host.sentUserMessages[0];
		expect(prompt).toContain(
			'<roaster-review-definition key="asdl-typescript-style" path="reviews/asdl-typescript-style.md">',
		);
		expect(prompt).toContain("# ASDL TypeScript style review");
		expect(prompt).toContain("Run Roast: ASDL TypeScript style now.");
		expect(prompt).toContain(buildFencedTextBlock(rawArgs));
	});

	test("fail-closes when canonical review loading fails", async () => {
		const host = new FakeRoastHost();
		roastExtension(host, {
			entries: [TYPESCRIPT_ENTRY],
			loadReviewDefinition: async () => ({
				type: "error",
				error: {
					type: "review_definition_not_found",
					message: "No review found for key asdl-typescript-style.",
				},
			}),
		});
		const context = commandContext("/repo");

		await registeredCommand(host, "roast:asdl-typescript-style").handler("", context.ctx);

		expect(context.waitCount()).toBe(1);
		expect(context.notifications).toEqual([
			{
				message:
					"Could not load reviews/asdl-typescript-style.md through Roaster catalog: No review found for key asdl-typescript-style.",
				level: "error",
			},
		]);
		expect(host.sentUserMessages).toEqual([]);
	});

	test("prompt builder uses the default prompt when no raw args are provided", () => {
		const reviewPrompt = buildRoasterReviewPrompt(
			roastEntry({
				reviewKey: "review-fixture",
				title: "Review fixture",
				description: "Review fixture description.",
			}),
			"# Review fixture",
			"   ",
		);

		expect(reviewPrompt).toContain("# Review fixture");
		expect(reviewPrompt).toContain("Run Roast: Review fixture now.");
		expect(reviewPrompt).toContain(
			"Run the Review fixture roast against the current branch changes.",
		);
		expect(reviewPrompt).not.toContain("Use this user-supplied review request/scope");
		expect(reviewPrompt).not.toContain("was not available");
	});
});

function roastEntry(options: {
	readonly reviewKey: string;
	readonly title: string;
	readonly description: string;
}): RoastSkillEntry {
	return {
		surface: `roast:${options.reviewKey}`,
		reviewKey: options.reviewKey,
		reviewPath: `reviews/${options.reviewKey}.md`,
		title: options.title,
		label: `Roast: ${options.title}`,
		description: options.description,
		defaultPrompt: `Run the ${options.title} roast against the current branch changes.`,
	};
}

function successfulLoader(source: string): LoadRoastReviewDefinition {
	return async (request) => okLoaded(request.entry, source);
}

function okLoaded(entry: RoastSkillEntry, source: string): RoastReviewLoadResult {
	return {
		type: "ok",
		entry,
		source: {
			key: entry.reviewKey,
			path: `/repo/${entry.reviewPath}`,
			source,
		},
		definition: {
			name: entry.reviewKey,
			description: entry.description,
			instructions: source,
			defaultModel: null,
			applicability: { include: [], exclude: [] },
			localOnly: false,
		},
	};
}
