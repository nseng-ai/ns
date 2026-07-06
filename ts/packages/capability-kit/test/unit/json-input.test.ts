import { z } from "zod";
import { describe, expect, test } from "vitest";

import {
	loadJsonInput,
	parseJsonInputText,
	parseJsonInputValue,
} from "@nseng-ai/capability-kit/json-input";
import { withTemporaryFile } from "@nseng-ai/capability-kit/temp-files";

describe("JSON input source helpers", () => {
	test("loads stdin, inline JSON, and file JSON", async () => {
		const schema = z.object({ value: z.string() });
		const stdinResult = await loadJsonInput({
			optionValue: undefined,
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => '{"value":"stdin"}',
		});
		expect(stdinResult).toEqual({ type: "ok", value: { value: "stdin" } });

		const inlineResult = await loadJsonInput({
			optionValue: '{"value":"inline"}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(inlineResult).toEqual({ type: "ok", value: { value: "inline" } });

		await withTemporaryFile(
			{ prefix: "json-input-test-", filename: "payload.json", contents: '{"value":"file"}' },
			async (payloadPath) => {
				const fileResult = await loadJsonInput({
					optionValue: undefined,
					filePath: payloadPath,
					commandName: "demo",
					inputDescription: "payload",
					optionName: "--payload-json",
					fileOptionName: "--payload-file",
					schema,
					stdin: async () => "",
				});
				expect(fileResult).toEqual({ type: "ok", value: { value: "file" } });
			},
		);
	});

	test("reports source conflicts, empty input, invalid JSON, missing files, and schema errors", async () => {
		const schema = z.object({ value: z.string() });
		const conflict = await loadJsonInput({
			optionValue: "{}",
			filePath: "/tmp/payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema,
			stdin: async () => "",
		});
		expect(conflict).toEqual({
			type: "error",
			error: {
				errorType: "invalid-request",
				message:
					"demo accepts only one payload source; do not pass both --payload-json and --payload-file.",
			},
		});

		const empty = await loadJsonInput({
			optionValue: "   ",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "unused",
		});
		expect(empty.type).toBe("error");
		if (empty.type === "error") expect(empty.error.errorType).toBe("invalid-request");

		const invalidJson = await loadJsonInput({
			optionValue: "{",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(invalidJson.type).toBe("error");
		if (invalidJson.type === "error") expect(invalidJson.error.errorType).toBe("invalid-json");

		const missingFile = await loadJsonInput({
			optionValue: undefined,
			filePath: "/tmp/definitely-missing-json-input-payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema,
			stdin: async () => "",
		});
		expect(missingFile.type).toBe("error");
		if (missingFile.type === "error") expect(missingFile.error.errorType).toBe("invalid-request");

		const schemaError = await loadJsonInput({
			optionValue: '{"value": 3}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(schemaError.type).toBe("error");
		if (schemaError.type === "error") expect(schemaError.error.errorType).toBe("invalid-request");
	});

	test("parses already-loaded JSON text with schema-backed errors", () => {
		const schema = z.object({ value: z.string() });
		expect(
			parseJsonInputText({
				text: '{"value":"ok"}',
				schema,
				jsonDescription: "demo payload",
			}),
		).toEqual({ type: "ok", value: { value: "ok" } });

		const invalidJson = parseJsonInputText({
			text: "{",
			schema,
			jsonDescription: "demo payload",
		});
		expect(invalidJson.type).toBe("error");
		if (invalidJson.type === "error") expect(invalidJson.error.errorType).toBe("invalid-json");

		const invalidSchema = parseJsonInputText({
			text: '{"value":3}',
			schema,
			jsonDescription: "demo payload",
			schemaDescription: "demo schema",
		});
		expect(invalidSchema.type).toBe("error");
		if (invalidSchema.type === "error") {
			expect(invalidSchema.error.errorType).toBe("invalid-request");
			expect(invalidSchema.error.message).toContain("Invalid demo schema");
		}
	});

	test("validates already-parsed JSON values", () => {
		const result = parseJsonInputValue({
			value: { value: "ok" },
			schema: z.object({ value: z.string() }),
			schemaDescription: "demo value",
		});
		expect(result).toEqual({ type: "ok", value: { value: "ok" } });
	});
});
