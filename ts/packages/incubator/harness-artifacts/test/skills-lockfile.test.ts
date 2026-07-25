import { describe, expect, test } from "vitest";

import { parseInspectedLockfile, parseLockfileData } from "../src/skills-lockfile.ts";

const VALID_HASH = "a".repeat(64);

function entry(
	options: Partial<Record<"source" | "sourceType" | "computedHash" | "skillPath", unknown>> = {},
): object {
	return {
		source: "skills/example",
		sourceType: "local",
		computedHash: VALID_HASH,
		...options,
	};
}

describe("skills lockfile parser", () => {
	test("parses typed entries sorted by skill name", () => {
		const result = parseLockfileData({
			version: 1,
			skills: {
				zeta: entry({ source: "skills/zeta" }),
				alpha: entry({ source: "org/repo", sourceType: "github", skillPath: "skills/alpha" }),
			},
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.skills.map((skill) => skill.name)).toEqual(["alpha", "zeta"]);
		expect(result.value.skills[0]).toMatchObject({
			sourceType: "github",
			skillPath: "skills/alpha",
		});
	});

	test.each([
		[[], "$: Invalid input: expected object, received array"],
		[{ skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: true, skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: 2, skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: 1 }, "$.skills: Invalid input: expected record, received undefined"],
		[{ version: 1, skills: [] }, "$.skills: Invalid input: expected record, received array"],
		[
			{ version: 1, skills: { pytest: [] } },
			"$.skills.pytest: Invalid input: expected object, received array",
		],
		[
			{ version: 1, skills: { pytest: { sourceType: "github", computedHash: VALID_HASH } } },
			"$.skills.pytest.source: Invalid input: expected string, received undefined",
		],
		[
			{ version: 1, skills: { pytest: entry({ sourceType: 1 }) } },
			"$.skills.pytest.sourceType: Invalid option: expected one of",
		],
		[
			{ version: 1, skills: { pytest: entry({ sourceType: "npm" }) } },
			"$.skills.pytest.sourceType: Invalid option: expected one of",
		],
		[
			{ version: 1, skills: { pytest: entry({ computedHash: 1 }) } },
			"$.skills.pytest.computedHash: Invalid input: expected string, received number",
		],
		[
			{ version: 1, skills: { pytest: entry({ skillPath: 1 }) } },
			"$.skills.pytest.skillPath: Invalid input: expected string, received number",
		],
	])("rejects malformed shape %#", (data, expected) => {
		const result = parseLockfileData(data);

		expect(result).toMatchObject({ ok: false });
		if (result.ok) return;
		expect(result.error.message).toContain("Invalid skills-lock.json");
		expect(result.error.message).toContain(expected);
	});

	test("reports a missing lockfile from an inspected text-file state", () => {
		const result = parseInspectedLockfile({
			projectDir: "/repo",
			lockfile: { type: "missing" },
		});

		expect(result).toEqual({
			ok: false,
			error: {
				code: "lockfile_missing",
				message: "skills-lock.json not found in /repo. Is this a skill-managed project?",
			},
		});
	});

	test("parses a lockfile from an inspected text-file state", () => {
		const result = parseInspectedLockfile({
			projectDir: "/repo",
			lockfile: {
				type: "file",
				text: JSON.stringify({ version: 1, skills: { demo: entry() } }),
			},
		});

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) return;
		expect(result.value.skills.map((skill) => skill.name)).toEqual(["demo"]);
	});
});
