import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	INSTALL_MANIFEST_FILE_NAME,
	provisionFirstPartySkill,
	type ProvisionFirstPartySkillRequest,
} from "../src/harness-artifacts/api.ts";
import { InMemoryHarnessFs } from "./support/in-memory-harness-fs.ts";

const SOURCE_ROOT = "/source";
const PROJECT_ROOT = "/repo";
const TARGET_ROOT = join(PROJECT_ROOT, ".pi/skills");
const TARGET_SKILL_PATH = join(TARGET_ROOT, "objective/SKILL.md");
const MANIFEST_PATH = join(TARGET_ROOT, INSTALL_MANIFEST_FILE_NAME);

function sourceFixtureFs(): InMemoryHarnessFs {
	return new InMemoryHarnessFs({
		[join(SOURCE_ROOT, "skills/incubating/objectives/objective/SKILL.md")]: "objective skill\n",
		[join(SOURCE_ROOT, "skills/incubating/objectives/objective/references/guide.md")]:
			"objective guide\n",
	});
}

function request(
	fs: InMemoryHarnessFs,
	overrides: Partial<ProvisionFirstPartySkillRequest> = {},
): ProvisionFirstPartySkillRequest {
	return {
		skill: "objective",
		harness: "pi",
		scope: "project",
		projectRoot: PROJECT_ROOT,
		env: {},
		isDryRun: false,
		shouldForce: false,
		sourceRoot: SOURCE_ROOT,
		sourceVersion: "test-version",
		fs,
		...overrides,
	};
}

describe("provisionFirstPartySkill", () => {
	test("applies a first-party skill and writes the install manifest", async () => {
		const fs = sourceFixtureFs();

		const outcome = await provisionFirstPartySkill(request(fs));

		expect(outcome).toMatchObject({
			type: "provisioned",
			mode: "applied",
			manifestPath: MANIFEST_PATH,
		});
		if (outcome.type !== "provisioned") throw new Error("expected provisioned outcome");
		expect(new Set(outcome.writtenFiles)).toEqual(
			new Set([TARGET_SKILL_PATH, join(TARGET_ROOT, "objective/references/guide.md")]),
		);
		expect(fs.readText(TARGET_SKILL_PATH)).toBe("objective skill\n");
		expect(fs.readText(join(TARGET_ROOT, "objective/references/guide.md"))).toBe(
			"objective guide\n",
		);
		const manifest = JSON.parse(fs.readText(MANIFEST_PATH) ?? "{}") as {
			artifacts: Record<string, { provisionName: string; source: { version: string } }>;
		};
		expect(manifest.artifacts["pi:project:skill:objective-skill"]).toMatchObject({
			provisionName: "objective",
			source: { version: "test-version" },
		});
	});

	test("previews without writing in dry-run mode", async () => {
		const fs = sourceFixtureFs();

		const outcome = await provisionFirstPartySkill(request(fs, { isDryRun: true }));

		expect(outcome).toMatchObject({
			type: "provisioned",
			mode: "dry-run",
			manifestPath: MANIFEST_PATH,
			writtenFiles: [],
		});
		expect(fs.writtenFiles).toEqual([]);
		expect(fs.readText(TARGET_SKILL_PATH)).toBeUndefined();
	});

	test("reports locally edited targets as conflicted and honors force", async () => {
		const fs = sourceFixtureFs();
		fs.setFile(TARGET_SKILL_PATH, "local edit\n");

		const conflicted = await provisionFirstPartySkill(request(fs));
		expect(conflicted).toMatchObject({
			type: "conflicted",
			manifestPath: MANIFEST_PATH,
			conflictingFiles: [TARGET_SKILL_PATH],
		});
		expect(fs.readText(TARGET_SKILL_PATH)).toBe("local edit\n");

		const forced = await provisionFirstPartySkill(request(fs, { shouldForce: true }));
		expect(forced).toMatchObject({ type: "provisioned", mode: "applied" });
		expect(fs.readText(TARGET_SKILL_PATH)).toBe("objective skill\n");
	});

	test("reports unknown skills", async () => {
		const fs = sourceFixtureFs();

		const outcome = await provisionFirstPartySkill(request(fs, { skill: "nonexistent" }));

		expect(outcome).toEqual({ type: "unknown-skill", skill: "nonexistent" });
	});
});
