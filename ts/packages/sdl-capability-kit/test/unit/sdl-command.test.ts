import type { SdlExtensionApi } from "sdl-sdk";
import { describe, expect, test } from "vitest";
import { z } from "zod";

import { createSdlDomainCommand } from "@sdl/capability-kit/sdl-command";

interface TestContext {
	readonly cwd: string;
}

const requestSchema = z.object({ name: z.string() });
const resultSchema = z.object({ greeting: z.string() });

describe("SDL domain command helper", () => {
	test("adapts an SDL extension context before invoking the domain handler", async () => {
		const command = createSdlDomainCommand({
			name: "hello",
			summary: "Say hello",
			description: "Says hello through a domain context.",
			schema: requestSchema,
			resultSchema,
			createContext: (ctx): TestContext => ({ cwd: ctx.cwd }),
			handler: async (ctx, request) => ({
				type: "ok",
				data: { greeting: `${request.name} from ${ctx.cwd}` },
			}),
		});

		await expect(command.run(fakeApi(), { name: "Ada" })).resolves.toEqual({
			type: "ok",
			data: { greeting: "Ada from /repo" },
		});
	});

	test("parses unknown render payloads through the result schema", () => {
		const command = createSdlDomainCommand({
			name: "hello",
			summary: "Say hello",
			description: "Says hello through a domain context.",
			schema: requestSchema,
			resultSchema,
			createContext: (ctx): TestContext => ({ cwd: ctx.cwd }),
			renderHuman: (data) => data.greeting,
			handler: async () => ({ type: "ok", data: { greeting: "unused" } }),
		});

		const caps = { canEmitAnsi: false };
		expect(command.renderHuman?.({ greeting: "hello" }, caps)).toBe("hello");
		expect(() => command.renderHuman?.({ greeting: 42 }, caps)).toThrow();
	});
});

function fakeApi(): SdlExtensionApi {
	return {
		cwd: "/repo",
		env: {},
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
				killed: false,
			};
		},
	};
}
