import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, test } from "vitest";

import { readStdinLine } from "@asdl/core/stdin";

describe("readStdinLine", () => {
	test("resolves after one newline without waiting for EOF", async () => {
		const input = new PassThrough();
		const line = readStdinLine(input);

		try {
			input.write("yes\n");

			const result = await Promise.race([line, delay(100).then(() => "timed_out" as const)]);
			expect(result).toBe("yes");
		} finally {
			input.destroy();
		}
	});
});
