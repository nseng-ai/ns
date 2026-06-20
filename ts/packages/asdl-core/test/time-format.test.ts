import { describe, expect, test } from "vitest";

import { formatCountdownMs, formatElapsedMs } from "../src/time-format.ts";

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

describe("formatCountdownMs", () => {
	test("clamps negative remaining time to zero seconds", () => {
		expect(formatCountdownMs(-1)).toBe("0s");
	});

	test("rounds partial remaining seconds up", () => {
		expect(formatCountdownMs(9_200)).toBe("10s");
	});

	test("formats exact minutes compactly", () => {
		expect(formatCountdownMs(60_000)).toBe("1m");
	});

	test("formats minutes and zero-padded remaining seconds compactly", () => {
		expect(formatCountdownMs(65_000)).toBe("1m05s");
	});
});
