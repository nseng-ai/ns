import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";
import { describe, expect, test } from "vitest";

import { loadJsonInput } from "../../src/json-input.ts";
import { useTempDirs } from "../support/temp.ts";

const makeScopedTempDir = useTempDirs();

async function makeTempDir(): Promise<string> {
	return makeScopedTempDir("pr-address-json-input-");
}

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

		const tempDir = await makeTempDir();
		const payloadPath = join(tempDir, "payload.json");
		await writeFile(payloadPath, '{"value":"file"}', "utf8");
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
				errorType: "invalid_request",
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
		if (empty.type === "error") expect(empty.error.errorType).toBe("invalid_request");

		const invalidJson = await loadJsonInput({
			optionValue: "{",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(invalidJson.type).toBe("error");
		if (invalidJson.type === "error") expect(invalidJson.error.errorType).toBe("invalid_json");

		const missingFile = await loadJsonInput({
			optionValue: undefined,
			filePath: "/tmp/definitely-missing-pr-address-payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema,
			stdin: async () => "",
		});
		expect(missingFile.type).toBe("error");
		if (missingFile.type === "error") expect(missingFile.error.errorType).toBe("invalid_request");

		const schemaError = await loadJsonInput({
			optionValue: '{"value": 3}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema,
			stdin: async () => "",
		});
		expect(schemaError.type).toBe("error");
		if (schemaError.type === "error") expect(schemaError.error.errorType).toBe("invalid_request");
	});
});
