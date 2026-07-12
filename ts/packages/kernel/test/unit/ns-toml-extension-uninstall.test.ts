import { describe, expect, test } from "vitest";

import {
	planDeclaredExtensionTarget,
	planDeclaredExtensionUninstallToml,
} from "@nseng-ai/kernel/project-config";

function plan(nsTomlContent: string, requestedSpec: string) {
	return planDeclaredExtensionUninstallToml({
		projectRoot: "/repo/project",
		nsTomlContent,
		requestedSpec,
	});
}

function planTarget(nsTomlContent: string, requestedSpec: string) {
	return planDeclaredExtensionTarget({
		projectRoot: "/repo/project",
		nsTomlContent,
		requestedSpec,
	});
}

describe("ns.toml extension update targets", () => {
	test("matches an exact npm declaration and returns its non-empty spec", () => {
		expect(planTarget('extensions = ["npm:@scope/pkg@1"]\n', "npm:@scope/pkg@1")).toEqual({
			ok: true,
			matchedSpec: "npm:@scope/pkg@1",
		});
	});

	test("reports an absent declaration with empty declared and matching sets", () => {
		expect(planTarget('harnesses = ["pi"]\n', "npm:@scope/pkg@1")).toEqual({
			ok: false,
			reason: "not-declared",
			requestedSpec: "npm:@scope/pkg@1",
			declaredSpecs: [],
			matchingSpecs: [],
			message: "Extension target is not declared in ns.toml: npm:@scope/pkg@1.",
		});
	});

	test("does not target a different version of the same npm package", () => {
		expect(planTarget('extensions = ["npm:@scope/pkg@1"]\n', "npm:@scope/pkg@2")).toMatchObject({
			ok: false,
			reason: "not-declared",
			matchingSpecs: [],
		});
	});

	test("matches equivalent normalized local paths", () => {
		expect(
			planTarget('extensions = ["extensions/../extensions/tools"]\n', "./extensions/tools"),
		).toEqual({
			ok: true,
			matchedSpec: "extensions/../extensions/tools",
		});
	});

	test("rejects duplicate normalized local identities as ambiguous", () => {
		expect(
			planTarget(
				'extensions = ["./extensions/tools", "extensions/../extensions/tools"]\n',
				"./extensions/tools",
			),
		).toMatchObject({
			ok: false,
			reason: "ambiguous-identity",
			matchingSpecs: ["./extensions/tools", "extensions/../extensions/tools"],
		});
	});
});

describe("ns.toml extension uninstall edits", () => {
	test.each([
		{
			name: "first same-line value",
			nsTomlContent: 'extensions = ["npm:first", "npm:second", "npm:third"]\n',
			requested: "npm:first@2",
			expected: 'extensions = [ "npm:second", "npm:third"]\n',
			matched: "npm:first",
		},
		{
			name: "middle same-line value",
			nsTomlContent: 'extensions = ["npm:first", "npm:second", "npm:third"]\n',
			requested: "npm:second@2",
			expected: 'extensions = ["npm:first",  "npm:third"]\n',
			matched: "npm:second",
		},
		{
			name: "last same-line value",
			nsTomlContent: 'extensions = ["npm:first", "npm:second", "npm:third"]\n',
			requested: "npm:third@2",
			expected: 'extensions = ["npm:first", "npm:second" ]\n',
			matched: "npm:third",
		},
		{
			name: "single same-line value",
			nsTomlContent: 'extensions = ["npm:only"] # retained\n',
			requested: "npm:only",
			expected: "extensions = [] # retained\n",
			matched: "npm:only",
		},
		{
			name: "first multiline value with comment",
			nsTomlContent:
				'extensions = [\n  "npm:first", # retained first comment\n  "npm:second",\n]\n',
			requested: "npm:first@latest",
			expected: 'extensions = [\n  \t # retained first comment\n  "npm:second",\n]\n'.replace(
				"\t",
				"",
			),
			matched: "npm:first",
		},
		{
			name: "middle multiline value",
			nsTomlContent:
				'extensions = [\n  "npm:first",\n  "npm:second", # retained middle comment\n  "npm:third",\n]\n',
			requested: "npm:second@3",
			expected: 'extensions = [\n  "npm:first",\n   # retained middle comment\n  "npm:third",\n]\n',
			matched: "npm:second",
		},
		{
			name: "single multiline value",
			nsTomlContent: 'extensions = [\n  "npm:only", # retained only comment\n]\n',
			requested: "npm:only@3",
			expected: "extensions = [\n   # retained only comment\n]\n",
			matched: "npm:only",
		},
		{
			name: "last multiline value with CRLF and trailing comma",
			nsTomlContent: "extensions = [\r\n  'npm:first',\r\n  'npm:second', # retained\r\n]\r\n",
			requested: "npm:second@3",
			expected: "extensions = [\r\n  'npm:first',\r\n   # retained\r\n]\r\n",
			matched: "npm:second",
		},
	])(
		"removes only the matched token/comma for $name",
		({ nsTomlContent, requested, expected, matched }) => {
			expect(plan(nsTomlContent, requested)).toEqual({
				ok: true,
				text: expected,
				isRemoved: true,
				matchedSpec: matched,
			});
		},
	);

	test("matches normalized local paths and preserves every unrelated byte", () => {
		const nsTomlContent =
			'custom = "bytes"\nextensions = ["./extensions/a", \'extensions/../extensions/tools\'] # tail\n[points]\nx = 1\n';
		expect(plan(nsTomlContent, "./extensions/tools")).toEqual({
			ok: true,
			text: 'custom = "bytes"\nextensions = ["./extensions/a" ] # tail\n[points]\nx = 1\n',
			isRemoved: true,
			matchedSpec: "extensions/../extensions/tools",
		});
	});

	test.each(["", 'harnesses = ["pi"]\r\n'])(
		"returns unchanged when the extensions assignment is absent",
		(nsTomlContent) => {
			expect(plan(nsTomlContent, "npm:absent")).toEqual({
				ok: true,
				text: nsTomlContent,
				isRemoved: false,
			});
		},
	);

	test("returns unchanged when the canonical identity is absent", () => {
		const nsTomlContent = 'extensions = ["npm:present@1"]\n';
		expect(plan(nsTomlContent, "npm:absent")).toEqual({
			ok: true,
			text: nsTomlContent,
			isRemoved: false,
		});
	});

	test("rejects duplicate canonical identities as ambiguous", () => {
		expect(
			plan('extensions = ["npm:@scope/pkg", "npm:@scope/pkg@1"]\n', "npm:@scope/pkg@2"),
		).toMatchObject({
			ok: false,
			reason: "ambiguous-identity",
			identity: { kind: "npm", value: "@scope/pkg" },
			matchingSpecs: ["npm:@scope/pkg", "npm:@scope/pkg@1"],
		});
	});

	test("reports invalid TOML, invalid sources, and unsupported textual formats", () => {
		expect(plan("extensions = [", "npm:a")).toMatchObject({ ok: false, reason: "invalid-toml" });
		expect(plan("extensions = [1]\n", "npm:a")).toMatchObject({
			ok: false,
			reason: "invalid-extensions",
		});
		expect(plan('extensions = ["npm:a"]\n', "git:github/acme/a@main")).toMatchObject({
			ok: false,
			reason: "invalid-source",
		});
		expect(plan("", "git:github/acme/a@main")).toMatchObject({
			ok: false,
			reason: "invalid-source",
		});
		expect(plan('"extensions" = ["npm:a"]\n', "npm:a")).toMatchObject({
			ok: false,
			reason: "unsupported-format",
		});
	});
});
