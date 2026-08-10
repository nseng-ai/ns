import path from "node:path";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { z } from "zod";
import { describe, expect, test, vi } from "vitest";

import { loadJsonInput, parseJsonInputText } from "@nseng-ai/clinkr/app";

describe("JSON input source helpers", () => {
	test("loads readJsonInput, inline JSON, and file JSON", async () => {
		const payloadSchema = z.object({ value: z.string() });
		const stdinResult = await loadJsonInput({
			optionValue: undefined,
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema: payloadSchema,
			readJsonInput: async () => '{"value":"readJsonInput"}',
		});
		expect(stdinResult).toEqual({ type: "ok", value: { value: "readJsonInput" } });

		const readInlineFallback = vi.fn(async () => "");
		const inlineResult = await loadJsonInput({
			optionValue: '{"value":"inline"}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema: payloadSchema,
			readJsonInput: readInlineFallback,
		});
		expect(inlineResult).toEqual({ type: "ok", value: { value: "inline" } });
		expect(readInlineFallback).not.toHaveBeenCalled();

		await withTemporaryFile('{"value":"file"}', async (payloadPath) => {
			const readFileFallback = vi.fn(async () => "");
			const fileResult = await loadJsonInput({
				optionValue: undefined,
				filePath: payloadPath,
				commandName: "demo",
				inputDescription: "payload",
				optionName: "--payload-json",
				fileOptionName: "--payload-file",
				schema: payloadSchema,
				readJsonInput: readFileFallback,
			});
			expect(fileResult).toEqual({ type: "ok", value: { value: "file" } });
			expect(readFileFallback).not.toHaveBeenCalled();
		});
	});

	test("reports source conflicts, empty input, invalid JSON, missing files, and schema errors", async () => {
		const payloadSchema = z.object({ value: z.string() });
		const readConflictFallback = vi.fn(async () => "");
		const conflict = await loadJsonInput({
			optionValue: "{}",
			filePath: "/tmp/payload.json",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			fileOptionName: "--payload-file",
			schema: payloadSchema,
			readJsonInput: readConflictFallback,
		});
		expect(conflict).toEqual({
			type: "error",
			error: {
				errorType: "invalid-request",
				message:
					"demo accepts only one payload source; do not pass both --payload-json and --payload-file.",
			},
		});
		expect(readConflictFallback).not.toHaveBeenCalled();

		const empty = await loadJsonInput({
			optionValue: "   ",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema: payloadSchema,
			readJsonInput: async () => "unused",
		});
		expect(empty.type).toBe("error");
		if (empty.type === "error") expect(empty.error.errorType).toBe("invalid-request");

		const invalidJson = await loadJsonInput({
			optionValue: "{",
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema: payloadSchema,
			readJsonInput: async () => "",
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
			schema: payloadSchema,
			readJsonInput: async () => "",
		});
		expect(missingFile.type).toBe("error");
		if (missingFile.type === "error") expect(missingFile.error.errorType).toBe("invalid-request");

		const schemaError = await loadJsonInput({
			optionValue: '{"value": 3}',
			commandName: "demo",
			inputDescription: "payload",
			optionName: "--payload-json",
			schema: payloadSchema,
			readJsonInput: async () => "",
		});
		expect(schemaError.type).toBe("error");
		if (schemaError.type === "error") expect(schemaError.error.errorType).toBe("invalid-request");
	});

	test("parses already-loaded JSON text with schema-backed errors", () => {
		const payloadSchema = z.object({ value: z.string() });
		expect(
			parseJsonInputText({
				text: '{"value":"ok"}',
				schema: payloadSchema,
				jsonDescription: "demo payload",
			}),
		).toEqual({ type: "ok", value: { value: "ok" } });

		const invalidJson = parseJsonInputText({
			text: "{",
			schema: payloadSchema,
			jsonDescription: "demo payload",
		});
		expect(invalidJson.type).toBe("error");
		if (invalidJson.type === "error") expect(invalidJson.error.errorType).toBe("invalid-json");

		const invalidSchema = parseJsonInputText({
			text: '{"value":3}',
			schema: payloadSchema,
			jsonDescription: "demo payload",
			schemaDescription: "demo schema",
		});
		expect(invalidSchema.type).toBe("error");
		if (invalidSchema.type === "error") {
			expect(invalidSchema.error.errorType).toBe("invalid-request");
			expect(invalidSchema.error.message).toContain("Invalid demo schema");
		}
	});
});

async function withTemporaryFile(
	contents: string,
	useFile: (filePath: string) => Promise<void>,
): Promise<void> {
	const directory = await mkdtemp(path.join(tmpdir(), "clinkr-json-input-test-"));
	const filePath = path.join(directory, "payload.json");
	try {
		await writeFile(filePath, contents, "utf8");
		await useFile(filePath);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
