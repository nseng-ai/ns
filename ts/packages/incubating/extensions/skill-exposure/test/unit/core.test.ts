import { describe, expect, test } from "vitest";
import { skillPathResolutionError } from "../../src/node-skill-exposure-gateway.ts";
import { planSkillExposure, settingsForPolicy } from "../../src/policy.ts";
import type { PiSettings, SkillInspection } from "../../src/types.ts";
import {
	MANAGED_OPENAI_POLICY,
	SkillExposureInputError,
	SkillExposureIoError,
} from "../../src/types.ts";

const settings: PiSettings = {
	path: "/repo/.pi/settings.json",
	exists: true,
	data: { theme: "dark", skills: [] },
	exclusions: [],
};

function inspection(overrides: Partial<SkillInspection> = {}): SkillInspection {
	return {
		skill: "demo",
		canonicalPath: "/repo/skills/internal/test/demo",
		relativePath: "skills/internal/test/demo",
		policy: "normal",
		facts: {
			modelInvocationDisabled: false,
			managedSidecar: false,
			sidecarState: "missing",
			piExcluded: false,
			replacementSurface: "demo:run",
			replacementVerified: true,
		},
		implications: [],
		replacementEvidence: "verified /demo:run",
		diagnostics: [],
		skillMdText: "---\nname: demo\ndescription: Demo\ncustom: retained\n---\n\nBody\n",
		...overrides,
	};
}

describe("skill exposure policy", () => {
	test("classifies only missing skill paths as usage errors", () => {
		const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
		const inaccessible = Object.assign(new Error("denied"), { code: "EACCES" });

		expect(skillPathResolutionError("skills/internal/test/missing", missing)).toBeInstanceOf(
			SkillExposureInputError,
		);
		expect(skillPathResolutionError("skills/internal/test/private", inaccessible)).toBeInstanceOf(
			SkillExposureIoError,
		);
	});

	test("plans invoke-only while preserving unrelated frontmatter", () => {
		const plan = planSkillExposure(inspection(), "invoke-only");
		expect(plan.operations.filter((operation) => operation.type === "write")).toEqual([
			expect.objectContaining({
				path: "skills/internal/test/demo/SKILL.md",
				content: expect.stringContaining("custom: retained"),
			}),
			expect.objectContaining({
				path: "skills/internal/test/demo/agents/openai.yaml",
				content: MANAGED_OPENAI_POLICY,
			}),
		]);
		expect(settingsForPolicy(settings, "demo", "invoke-only").data).toEqual(settings.data);
	});

	test("requires replacement evidence and evolves one settings document", () => {
		expect(settingsForPolicy(settings, "demo", "command-backed").exclusions).toEqual([
			"-skills/demo",
		]);
		expect(() =>
			planSkillExposure(
				inspection({ facts: { ...inspection().facts, replacementVerified: false } }),
				"command-backed",
			),
		).toThrow(/verified command-backed registry row/);
	});

	test("normal plans deletion only for the exact managed sidecar", () => {
		const current = inspection({
			facts: {
				...inspection().facts,
				modelInvocationDisabled: true,
				managedSidecar: true,
				sidecarState: "managed",
				piExcluded: true,
			},
			skillMdText: "---\nname: demo\ndisable-model-invocation: true\ncustom: retained\n---\n",
		});
		expect(
			planSkillExposure(current, "normal").operations.map((operation) => operation.type),
		).toEqual(["write", "delete", "remove-empty-dir"]);
		expect(
			settingsForPolicy({ ...settings, exclusions: ["-skills/demo"] }, "demo", "normal").exclusions,
		).toEqual([]);
	});

	test("refuses unexpected sidecars", () => {
		expect(() =>
			planSkillExposure(
				inspection({ facts: { ...inspection().facts, sidecarState: "unexpected" } }),
				"normal",
			),
		).toThrow(/unexpected sidecar/);
	});
});
