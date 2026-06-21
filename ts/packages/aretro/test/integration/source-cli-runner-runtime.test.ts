import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const checkedInRunnerPath = join(repoRoot, "skills/branch-retro/scripts/aretro-run");

describe("aretro source CLI skill runner runtime", () => {
	test("checked-in runner remains valid bash", () => {
		const syntaxCheck = spawnSync("bash", ["-n", checkedInRunnerPath], { encoding: "utf8" });

		expect(syntaxCheck.status).toBe(0);
		expect(syntaxCheck.stderr).toBe("");
	});
});
