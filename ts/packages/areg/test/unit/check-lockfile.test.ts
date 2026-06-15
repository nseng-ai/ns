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
		[[], "root must be an object"],
		[{ skills: {} }, "$.version is required and must be 1"],
		[{ version: true, skills: {} }, "$.version must be 1"],
		[{ version: 2, skills: {} }, "$.version must be 1"],
		[{ version: 1 }, "$.skills is required and must be an object"],
		[{ version: 1, skills: [] }, "$.skills must be an object"],
		[{ version: 1, skills: { pytest: [] } }, "$.skills.pytest must be an object"],
		[{ version: 1, skills: { pytest: { sourceType: "github", computedHash: VALID_HASH } } }, "$.skills.pytest.source is required and must be a string"],
		[{ version: 1, skills: { pytest: entry({ sourceType: 1 }) } }, "$.skills.pytest.sourceType must be a string"],
		[{ version: 1, skills: { pytest: entry({ sourceType: "npm" }) } }, "$.skills.pytest.sourceType must be one of"],
		[{ version: 1, skills: { pytest: entry({ computedHash: 1 }) } }, "$.skills.pytest.computedHash must be a string"],
		[{ version: 1, skills: { pytest: entry({ skillPath: 1 }) } }, "$.skills.pytest.skillPath must be a string"],
	])("rejects malformed shape %#", (data, expected) => {
		const result = parseLockfileData(data);

		expect(result).toMatchObject({ type: "error" });
		if (result.type !== "error") return;
		expect(result.message).toContain("Invalid skills-lock.json");
		expect(result.message).toContain(expected);
	});
});
