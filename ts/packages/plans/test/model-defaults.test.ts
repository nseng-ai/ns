import { describe, expect, test } from "vitest";

import { DEFAULT_FAST_MODEL_REF, parseModelRef, resolveModelRef } from "../src/index.ts";

const ENV_VAR = "ASDL_TEST_MODEL";

describe("parseModelRef", () => {
	test("splits provider and modelId on the first slash", () => {
		expect(parseModelRef("openai-codex/gpt-5.4-mini")).toEqual({
			provider: "openai-codex",
			modelId: "gpt-5.4-mini",
		});
	});

	test("keeps later slashes inside the modelId", () => {
		expect(parseModelRef("bedrock/anthropic/claude")).toEqual({
			provider: "bedrock",
			modelId: "anthropic/claude",
		});
	});

	test("rejects refs without a separator or with edge separators", () => {
		expect(parseModelRef("gpt-5.4-mini")).toBeUndefined();
		expect(parseModelRef("/gpt-5.4-mini")).toBeUndefined();
		expect(parseModelRef("openai-codex/")).toBeUndefined();
		expect(parseModelRef("")).toBeUndefined();
	});
});

describe("resolveModelRef", () => {
	test("falls back to the default when the env var is unset", () => {
		const result = resolveModelRef({}, ENV_VAR, DEFAULT_FAST_MODEL_REF);
		expect(result).toEqual({
			ok: true,
			value: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
		});
	});

	test("uses a trimmed env override", () => {
		const result = resolveModelRef(
			{ [ENV_VAR]: "  acme/fast-1  " },
			ENV_VAR,
			DEFAULT_FAST_MODEL_REF,
		);
		expect(result).toEqual({ ok: true, value: { provider: "acme", modelId: "fast-1" } });
	});

	test("falls back to the default for empty or whitespace env values", () => {
		for (const value of ["", "   "]) {
			const result = resolveModelRef({ [ENV_VAR]: value }, ENV_VAR, DEFAULT_FAST_MODEL_REF);
			expect(result).toEqual({
				ok: true,
				value: { provider: "openai-codex", modelId: "gpt-5.4-mini" },
			});
		}
	});

	test("reports an error naming the env var for an invalid override", () => {
		const result = resolveModelRef({ [ENV_VAR]: "not-a-ref" }, ENV_VAR, DEFAULT_FAST_MODEL_REF);
		expect(result).toEqual({
			ok: false,
			error: `Invalid ${ENV_VAR}="not-a-ref". Expected "provider/modelId".`,
		});
	});
});
