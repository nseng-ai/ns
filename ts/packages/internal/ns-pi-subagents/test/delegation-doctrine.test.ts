import { describe, expect, test } from "vitest";

import {
	buildSubagentDelegationDoctrine,
	SUBAGENT_DELEGATION_INTRO,
} from "../src/delegation-doctrine.ts";

const EXPLORER_SECTION = [
	"### `subagent` agent `explorer` — parallel read-only scouts",
	"- Use the explorer agent for reconnaissance.",
].join("\n");
const TASK_SECTION = [
	"### `subagent` agent `task` — focused delegated work",
	"- Use the task agent for focused delegation.",
].join("\n");

function requireDoctrine(text: string | undefined): string {
	if (text === undefined) throw new Error("Expected doctrine text.");
	return text;
}

function countSubsectionHeadings(text: string): number {
	return text.match(/^### /gmu)?.length ?? 0;
}

describe("subagent delegation doctrine", () => {
	test("builds supplied healthy subsections in supplied order", () => {
		const doctrine = requireDoctrine(
			buildSubagentDelegationDoctrine([EXPLORER_SECTION, TASK_SECTION]),
		);

		expect(doctrine).toBe([SUBAGENT_DELEGATION_INTRO, EXPLORER_SECTION, TASK_SECTION].join("\n\n"));
		expect(countSubsectionHeadings(doctrine)).toBe(2);
	});

	test("builds only supplied sections", () => {
		const doctrine = requireDoctrine(buildSubagentDelegationDoctrine([EXPLORER_SECTION]));

		expect(doctrine).toBe([SUBAGENT_DELEGATION_INTRO, EXPLORER_SECTION].join("\n\n"));
		expect(countSubsectionHeadings(doctrine)).toBe(1);
	});

	test("omits doctrine when no sections are supplied", () => {
		expect(buildSubagentDelegationDoctrine([])).toBeUndefined();
		expect(buildSubagentDelegationDoctrine([""])).toBeUndefined();
	});

	test("is byte deterministic across repeated calls", () => {
		const input = [EXPLORER_SECTION, TASK_SECTION];
		expect(buildSubagentDelegationDoctrine(input)).toBe(buildSubagentDelegationDoctrine(input));
	});
});
