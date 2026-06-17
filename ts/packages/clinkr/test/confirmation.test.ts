import { describe, expect, test } from "vitest";

import { confirmFromStdin } from "../src/index.ts";

async function confirm(input: string, defaultAnswer: "yes" | "no") {
	const stderr: string[] = [];
	const result = await confirmFromStdin({
		stdin: async () => input,
		stderr: (text) => stderr.push(text),
		prompt: "Continue? ",
		defaultAnswer,
	});
	return { result, stderr };
}

describe("confirmFromStdin", () => {
	test.each(["y", "Y", "yes", "YES", " yes "])("accepts yes input %j", async (input) => {
		await expect(confirm(input, "no")).resolves.toMatchObject({ result: "yes" });
	});

	test.each(["n", "N", "no", "NO", " no "])("accepts no input %j", async (input) => {
		await expect(confirm(input, "yes")).resolves.toMatchObject({ result: "no" });
	});

	test("uses the configured default for empty input", async () => {
		await expect(confirm("\n", "yes")).resolves.toMatchObject({ result: "yes" });
		await expect(confirm("\n", "no")).resolves.toMatchObject({ result: "no" });
	});

	test("reprompts after invalid input and consumes the next answer", async () => {
		const result = await confirm("maybe\ny\n", "no");
		expect(result.result).toBe("yes");
		expect(result.stderr).toEqual(["Continue? ", "Error: invalid input\n", "Continue? "]);
	});

	test("returns an aborted failure when input ends without an answer", async () => {
		await expect(confirm("maybe", "no")).resolves.toMatchObject({
			result: { type: "failure", errorType: "aborted", message: "Aborted!" },
		});
	});
});
