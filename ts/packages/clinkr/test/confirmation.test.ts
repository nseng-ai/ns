import { describe, expect, test } from "vitest";

import { createClinkrInteraction } from "../src/index.ts";

async function confirm(input: string, defaultAnswer: "yes" | "no") {
	const stderr: string[] = [];
	let unreadInput: string | null = input;
	const interaction = createClinkrInteraction({
		stdin: async () => {
			const value = unreadInput;
			unreadInput = null;
			return value;
		},
		stderr: (text) => stderr.push(text),
	});
	const result = await interaction.confirm({ message: "Continue?", defaultAnswer });
	return { result, stderr };
}

async function confirmLines(inputLines: readonly string[], defaultAnswer: "yes" | "no") {
	const stderr: string[] = [];
	const lines = [...inputLines];
	const interaction = createClinkrInteraction({
		stdin: async () => lines.shift() ?? null,
		stderr: (text) => stderr.push(text),
	});
	const result = await interaction.confirm({ message: "Continue?", defaultAnswer });
	return { result, stderr };
}

describe("ClinkrInteraction.confirm", () => {
	test.each(["y", "Y", "yes", "YES", " yes "])("accepts yes input %j", async (input) => {
		await expect(confirm(input, "no")).resolves.toMatchObject({
			result: { type: "confirmed" },
		});
	});

	test.each(["n", "N", "no", "NO", " no "])("accepts no input %j", async (input) => {
		await expect(confirm(input, "yes")).resolves.toMatchObject({
			result: { type: "declined" },
		});
	});

	test("uses the configured default for empty input", async () => {
		await expect(confirm("\n", "yes")).resolves.toMatchObject({
			result: { type: "confirmed" },
		});
		await expect(confirm("\n", "no")).resolves.toMatchObject({
			result: { type: "declined" },
		});
	});

	test("formats default yes and default no prompts on stderr", async () => {
		await expect(confirm("y", "yes")).resolves.toMatchObject({
			stderr: ["Continue? [Y/n]: "],
		});
		await expect(confirm("y", "no")).resolves.toMatchObject({
			stderr: ["Continue? [y/N]: "],
		});
	});

	test("reprompts after invalid input and consumes the next answer", async () => {
		const result = await confirm("maybe\ny\n", "no");
		expect(result.result).toEqual({ type: "confirmed" });
		expect(result.stderr).toEqual([
			"Continue? [y/N]: ",
			"Error: invalid input\n",
			"Continue? [y/N]: ",
		]);
	});

	test("reprompts when stdin provides one interactive line at a time", async () => {
		const result = await confirmLines(["maybe", "y"], "no");
		expect(result.result).toEqual({ type: "confirmed" });
		expect(result.stderr).toEqual([
			"Continue? [y/N]: ",
			"Error: invalid input\n",
			"Continue? [y/N]: ",
		]);
	});

	test("returns aborted when input ends without an answer", async () => {
		await expect(confirm("maybe", "no")).resolves.toMatchObject({
			result: { type: "aborted" },
		});
	});
});
