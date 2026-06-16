import { describe, expect, test } from "vitest";

import { formatElapsedMs } from "../src/time-format.ts";

describe("formatElapsedMs", () => {
	test("clamps negative elapsed time to zero seconds", () => {
		expect(formatElapsedMs(-1)).toBe("0s");
	});

	test("formats elapsed seconds below one minute", () => {
		expect(formatElapsedMs(5_000)).toBe("5s");
	});

	test("formats elapsed minutes and remaining seconds", () => {
		expect(formatElapsedMs(65_000)).toBe("1m 5s");
	});
});
