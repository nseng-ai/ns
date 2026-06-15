import { describe, expect, test } from "vitest";

import { parseLockfileData } from "../../src/operations/check.ts";

const VALID_HASH = "a".repeat(64);

function entry(options: Partial<Record<"source" | "sourceType" | "computedHash" | "skillPath", unknown>> = {}): object {
	return {
		source: "skills/example",
		sourceType: "local",
		computedHash: VALID_HASH,
		...options,
	};
}

describe("areg check lockfile parser", () => {
	test("parses typed entries sorted by skill name", () => {
		const result = parseLockfileData({
			version: 1,
			skills: {
				zeta: entry({ source: "skills/zeta" }),
				alpha: entry({ source: "org/repo", sourceType: "github", skillPath: "skills/alpha" }),
			},
		});

		expect(result).toMatchObject({ type: "ok" });
		if (result.type !== "ok") return;
		expect(result.lockfile.skills.map((skill) => skill.name)).toEqual(["alpha", "zeta"]);
		expect(result.lockfile.skills[0]).toMatchObject({ sourceType: "github", skillPath: "skills/alpha" });
	});

	test.each([
		[[], "$: Invalid input: expected object, received array"],
		[{ skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: true, skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: 2, skills: {} }, "$.version: Invalid input: expected 1"],
		[{ version: 1 }, "$.skills: Invalid input: expected record, received undefined"],
		[{ version: 1, skills: [] }, "$.skills: Invalid input: expected record, received array"],
		[{ version: 1, skills: { pytest: [] } }, "$.skills.pytest: Invalid input: expected object, received array"],
		[{ version: 1, skills: { pytest: { sourceType: "github", computedHash: VALID_HASH } } }, "$.skills.pytest.source: Invalid input: expected string, received undefined"],
		[{ version: 1, skills: { pytest: entry({ sourceType: 1 }) } }, "$.skills.pytest.sourceType: Invalid option: expected one of"],
		[{ version: 1, skills: { pytest: entry({ sourceType: "npm" }) } }, "$.skills.pytest.sourceType: Invalid option: expected one of"],
		[{ version: 1, skills: { pytest: entry({ computedHash: 1 }) } }, "$.skills.pytest.computedHash: Invalid input: expected string, received number"],
		[{ version: 1, skills: { pytest: entry({ skillPath: 1 }) } }, "$.skills.pytest.skillPath: Invalid input: expected string, received number"],
	])("rejects malformed shape %#", (data, expected) => {
		const result = parseLockfileData(data);

		expect(result).toMatchObject({ type: "error" });
		if (result.type !== "error") return;
		expect(result.message).toContain("Invalid skills-lock.json");
		expect(result.message).toContain(expected);
	});
});
