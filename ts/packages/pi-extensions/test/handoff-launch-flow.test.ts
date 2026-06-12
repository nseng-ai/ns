import { describe, expect, test } from "vitest";

import { buildHandoffLaunchRequest } from "../src/handoff/launch-flow.ts";
import { createHandoffStartMessage, type HandoffStartMessages } from "../src/handoff/shared.ts";

const START_MESSAGES = {
	ready: "Starting test handoff flow…",
	fallbackLabel: "test handoff fallback",
} satisfies HandoffStartMessages;

describe("handoff launch flow helpers", () => {
	test("buildHandoffLaunchRequest trims and validates continuation focus", () => {
		expect(buildHandoffLaunchRequest({ branch: "feature/handoff", focus: "  continue auth work  " })).toEqual({
			type: "valid",
			request: { branch: "feature/handoff", focus: "continue auth work" },
		});
		expect(buildHandoffLaunchRequest({ branch: "feature/handoff", focus: " !!! " })).toEqual({
			type: "invalid",
			message: "Continuation focus must contain at least one letter or number.",
		});
	});

	test("createHandoffStartMessage formats skill fallback states", () => {
		expect(
			createHandoffStartMessage(
				START_MESSAGES,
				{ name: "handoff-create", commandName: "skill:handoff-create", path: "/skill", baseDir: "/", body: "# skill", block: "# skill" },
				undefined,
			),
		).toBe(
			"Starting test handoff flow…",
		);
		expect(createHandoffStartMessage(START_MESSAGES, undefined, "read failed")).toBe(
			"Could not read handoff-create skill; using fallback test handoff fallback. read failed",
		);
		expect(createHandoffStartMessage(START_MESSAGES, undefined, undefined)).toBe(
			"handoff-create skill was not found; using fallback test handoff fallback.",
		);
	});
});
