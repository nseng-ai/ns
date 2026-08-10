import { noopNsCommandIo, noopNsProgress, ok } from "@nseng-ai/sdk";
import type { NsCommandCompletionRequest, NsExtensionApi } from "@nseng-ai/sdk";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createNsDomainCommand } from "@nseng-ai/extension-kit/ns-command";

interface TestContext {
	readonly cwd: string;
}

const requestSchema = z.object({ name: z.string() });
const resultSchema = z.object({ greeting: z.string() });

describe("ns domain command helper", () => {
	test("adapts an ns extension context before invoking the domain handler", async () => {
		const command = createNsDomainCommand({
			name: "hello",
			summary: "Say hello",
			description: "Says hello through a domain context.",
			schema: requestSchema,
			resultSchema,
			createContext: (ctx): TestContext => ({ cwd: ctx.cwd }),
			handler: async (ctx, request) => ok({ greeting: `${request.name} from ${ctx.cwd}` }),
		});

		await expect(command.handler(fakeApi(), { name: "Ada" })).resolves.toEqual(
			ok({ greeting: "Ada from /repo" }),
		);
	});

	test("preserves dynamic completion providers", async () => {
		const command = createNsDomainCommand({
			name: "hello",
			summary: "Say hello",
			description: "Says hello through a domain context.",
			schema: requestSchema,
			resultSchema,
			completionProvider: (_ctx, request) => [{ value: request.current, type: "positional-value" }],
			createContext: (ctx): TestContext => ({ cwd: ctx.cwd }),
			handler: async () => ok({ greeting: "unused" }),
		});
		const request: NsCommandCompletionRequest = {
			commandPath: ["hello"],
			words: ["hello", "Ad"],
			current: "Ad",
			previous: ["hello"],
			args: ["Ad"],
			positionalIndex: 0,
		};

		await expect(
			Promise.resolve(command.completionProvider?.(fakeApi(), request)),
		).resolves.toEqual([{ value: "Ad", type: "positional-value" }]);
	});

	test("renders ok payloads through the result schema", async () => {
		const command = createNsDomainCommand({
			name: "hello",
			summary: "Say hello",
			description: "Says hello through a domain context.",
			schema: requestSchema,
			resultSchema,
			createContext: (ctx): TestContext => ({ cwd: ctx.cwd }),
			renderHuman: (data) => data.greeting,
			handler: async () => ok({ greeting: "unused" }),
		});

		expect(command.renderHuman?.({ greeting: "unused" }, { canEmitAnsi: false })).toBe("unused");
	});
});

function fakeApi(): NsExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		hasExtension: () => false,
		isInteractive: () => false,
		confirm: () => {
			throw new Error("Unexpected confirmation prompt in test.");
		},
		select: () => {
			throw new Error("Unexpected selection prompt in test.");
		},
		textGenerator: {
			async generateText() {
				return { ok: false, error: "unexpected model call" };
			},
		},
		async exec() {
			return {
				stdout: "",
				stderr: "",
				code: 0,
				type: "exited",
				signal: null,
			};
		},
	};
}
