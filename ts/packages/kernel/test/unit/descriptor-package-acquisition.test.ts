import { describe, expect, test } from "vitest";

import { npmPackageRoot } from "@nseng-ai/kernel/extensions/acquisition";
import {
	appendDeclaredExtensionSpecToml,
	descriptorExportTarget,
	nsExtensionExportTarget,
	parseDeclaredExtensionSpecsToml,
	planDeclaredExtensionInstallToml,
	resolveAcquiredDescriptorPackageRoot,
} from "@nseng-ai/kernel/project-config";

describe("ns.toml extension spec edits", () => {
	test("plans an install into an empty document", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent: "",
				requestedSpec: "./extensions/tools",
			}),
		).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/tools"]\n',
			isAdded: true,
		});
	});

	test("plans an install into an absent array without discarding whitespace or CRLF", () => {
		const nsTomlContent = 'harnesses = ["pi"]\r\n  ';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent,
				requestedSpec: "npm:@acme/tools",
			}),
		).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\r\n  \r\nextensions = ["npm:@acme/tools"]\r\n',
			isAdded: true,
		});
	});

	test("inserts an absent extensions assignment before the first table", () => {
		const nsTomlContent = '# keep\r\n[points]\r\nfoo = "bar"\r\n';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent,
				requestedSpec: "./extensions/tools",
			}),
		).toEqual({
			ok: true,
			text: '# keep\r\nextensions = ["./extensions/tools"]\r\n[points]\r\nfoo = "bar"\r\n',
			isAdded: true,
		});
	});

	test.each([
		{
			name: "multiline string bracket content",
			nsTomlContent: 'banner = """\n[not-a-table]\nkeep this text\n"""\n[points]\nfoo = "bar"\n',
			expected:
				'banner = """\n[not-a-table]\nkeep this text\n"""\nextensions = ["./extensions/tools"]\n[points]\nfoo = "bar"\n',
		},
		{
			name: "nested array rows",
			nsTomlContent: 'matrix = [\n  [1, 2],\n  [3, 4],\n]\n[points]\nfoo = "bar"\n',
			expected:
				'matrix = [\n  [1, 2],\n  [3, 4],\n]\nextensions = ["./extensions/tools"]\n[points]\nfoo = "bar"\n',
		},
		{
			name: "inline-table string and comment brackets",
			nsTomlContent:
				'settings = { marker = "[not-a-table]", nested = { value = "# ]" } } # [ignored]\n[points]\nfoo = "bar"\n',
			expected:
				'settings = { marker = "[not-a-table]", nested = { value = "# ]" } } # [ignored]\nextensions = ["./extensions/tools"]\n[points]\nfoo = "bar"\n',
		},
	])("inserts before a real top-level table after $name", ({ nsTomlContent, expected }) => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent,
				requestedSpec: "./extensions/tools",
			}),
		).toEqual({ ok: true, text: expected, isAdded: true });
	});

	test.each([
		{ name: "four-quote basic multiline terminator", quote: '"', closingLength: 4 },
		{ name: "five-quote basic multiline terminator", quote: '"', closingLength: 5 },
		{ name: "four-quote literal multiline terminator", quote: "'", closingLength: 4 },
		{ name: "five-quote literal multiline terminator", quote: "'", closingLength: 5 },
	])("inserts before a real table after a $name", ({ quote, closingLength }) => {
		const requestedSpec = "./extensions/tools";
		const banner = `banner = ${quote.repeat(3)}abc${quote.repeat(closingLength)}\n`;
		const table = '[points]\nfoo = "bar"\n';
		const result = planDeclaredExtensionInstallToml({
			projectRoot: "/repo",
			nsTomlContent: `${banner}${table}`,
			requestedSpec,
		});

		expect(result).toEqual({
			ok: true,
			text: `${banner}extensions = ["${requestedSpec}"]\n${table}`,
			isAdded: true,
		});
		if (!result.ok) throw new Error("Expected extension install planning to succeed.");
		expect(parseDeclaredExtensionSpecsToml(result.text)).toEqual({
			ok: true,
			specs: [requestedSpec],
		});
	});

	test("creates extensions array without reserializing the document", () => {
		expect(appendDeclaredExtensionSpecToml('harnesses = ["pi"]\n', "./extensions/tools")).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\nextensions = ["./extensions/tools"]\n',
			isAdded: true,
		});
	});

	test("appends idempotently to an existing extensions array", () => {
		const first = appendDeclaredExtensionSpecToml(
			'extensions = ["./extensions/a"]\n[points]\n',
			"./extensions/b",
		);
		expect(first).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: true,
		});
		expect(appendDeclaredExtensionSpecToml(first.ok ? first.text : "", "./extensions/b")).toEqual({
			ok: true,
			text: 'extensions = ["./extensions/a", "./extensions/b"]\n[points]\n',
			isAdded: false,
		});
	});

	test.each([
		{
			name: "multiline string",
			prefix: 'banner = """\n[not-a-table]\nkeep this text\n"""\n',
		},
		{
			name: "nested arrays and inline tables",
			prefix:
				'matrix = [\n  ["[#]"], # ] ignored\n  { value = "[still text]", nested = [1, 2] },\n]\n',
		},
	])("finds an existing extensions assignment after $name", ({ prefix }) => {
		const nsTomlContent = `${prefix}extensions = ["./extensions/a"]\n[points]\n`;
		expect(appendDeclaredExtensionSpecToml(nsTomlContent, "./extensions/b")).toEqual({
			ok: true,
			text: `${prefix}extensions = ["./extensions/a", "./extensions/b"]\n[points]\n`,
			isAdded: true,
		});
	});

	test("reports invalid ns.toml before editing", () => {
		expect(appendDeclaredExtensionSpecToml("extensions = [\n", "./extensions/a")).toMatchObject({
			ok: false,
			reason: "invalid-toml",
		});
	});

	test("plans exact-spec reruns without changing TOML formatting", () => {
		const nsTomlContent =
			'# project extensions\nextensions = [\n  "npm:@acme/tools", # retained\n]\n[points]\n';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent,
				requestedSpec: "npm:@acme/tools",
			}),
		).toEqual({ ok: true, text: nsTomlContent, isAdded: false });
	});

	test("appends to multiline arrays while preserving comments and table order", () => {
		const nsTomlContent =
			'harnesses = ["pi"]\nextensions = [\n  "./extensions/a" # keep this comment\n]\n\n[points]\nfoo = "bar"\n';
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent,
				requestedSpec: "npm:@acme/tools@1.2.3",
			}),
		).toEqual({
			ok: true,
			text: 'harnesses = ["pi"]\nextensions = [\n  "./extensions/a", # keep this comment\n  "npm:@acme/tools@1.2.3"\n]\n\n[points]\nfoo = "bar"\n',
			isAdded: true,
		});
	});

	test.each([
		{
			name: "same-line array",
			nsTomlContent: 'extensions = ["./extensions/a"]\n',
			expected: 'extensions = ["./extensions/a", "./extensions/new"]\n',
		},
		{
			name: "multiline array with bracket and comma in a comment",
			nsTomlContent: 'extensions = [\n  "./extensions/a" # keep ], here\n]\n',
			expected: 'extensions = [\n  "./extensions/a", # keep ], here\n  "./extensions/new"\n]\n',
		},
		{
			name: "CRLF multiline array",
			nsTomlContent: 'extensions = [\r\n  "./extensions/a" # keep ]\r\n]\r\n',
			expected: 'extensions = [\r\n  "./extensions/a", # keep ]\r\n  "./extensions/new"\r\n]\r\n',
		},
		{
			name: "quoted bracket and hash characters",
			nsTomlContent: 'extensions = ["./extensions/[a]#value"]\n',
			expected: 'extensions = ["./extensions/[a]#value", "./extensions/new"]\n',
		},
		{
			name: "escaped double quote",
			nsTomlContent: 'extensions = ["./extensions/a\\"[#]"]\n',
			expected: 'extensions = ["./extensions/a\\"[#]", "./extensions/new"]\n',
		},
		{
			name: "single-quoted value",
			nsTomlContent: "extensions = ['./extensions/[a]#value']\n",
			expected: "extensions = ['./extensions/[a]#value', \"./extensions/new\"]\n",
		},
		{
			name: "same-line close with a surrounding comment",
			nsTomlContent: 'extensions = ["./extensions/a"] # keep surrounding TOML\r\n',
			expected: 'extensions = ["./extensions/a", "./extensions/new"] # keep surrounding TOML\r\n',
		},
		{
			name: "empty same-line array",
			nsTomlContent: "extensions = []\n",
			expected: 'extensions = [ "./extensions/new"]\n',
		},
		{
			name: "empty multiline array",
			nsTomlContent: "extensions = [\n]\n",
			expected: 'extensions = [\n\t"./extensions/new"\n]\n',
		},
		{
			name: "same-line trailing comma",
			nsTomlContent: 'extensions = ["./extensions/a",]\n',
			expected: 'extensions = ["./extensions/a", "./extensions/new",]\n',
		},
		{
			name: "multiline trailing comma before comment",
			nsTomlContent: 'extensions = [\n  "./extensions/a", # keep trailing comma\n]\n',
			expected:
				'extensions = [\n  "./extensions/a", # keep trailing comma\n  "./extensions/new",\n]\n',
		},
	])("preserves formatting for $name", ({ nsTomlContent, expected }) => {
		expect(appendDeclaredExtensionSpecToml(nsTomlContent, "./extensions/new")).toEqual({
			ok: true,
			text: expected,
			isAdded: true,
		});
	});

	test.each([
		{
			name: "ordinary values",
			nsTomlContent: 'extensions = ["./extensions/a",\n  "./extensions/b"]\n',
			expected: 'extensions = ["./extensions/a",\n  "./extensions/b",\n  "./extensions/new"]\n',
			expectedSpecs: ["./extensions/a", "./extensions/b", "./extensions/new"],
		},
		{
			name: "a four-quote multiline string value",
			nsTomlContent: 'extensions = [\n  """./extensions/a""""]\n',
			expected: 'extensions = [\n  """./extensions/a"""",\n  "./extensions/new"]\n',
			expectedSpecs: ['./extensions/a"', "./extensions/new"],
		},
	])(
		"appends when the closing bracket shares the last $name line",
		({ nsTomlContent, expected, expectedSpecs }) => {
			const result = appendDeclaredExtensionSpecToml(nsTomlContent, "./extensions/new");

			expect(result).toEqual({ ok: true, text: expected, isAdded: true });
			if (!result.ok) throw new Error("Expected extension append to succeed.");
			expect(parseDeclaredExtensionSpecsToml(result.text)).toEqual({
				ok: true,
				specs: expectedSpecs,
			});
		},
	);

	test("rejects the same npm identity under a different exact spec", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo",
				nsTomlContent: 'extensions = ["npm:@acme/tools"]\n',
				requestedSpec: "npm:@acme/tools@1.2.3",
			}),
		).toEqual({
			ok: false,
			reason: "identity-conflict",
			identity: { kind: "npm", value: "@acme/tools" },
			requestedSpec: "npm:@acme/tools@1.2.3",
			existingSpecs: ["npm:@acme/tools"],
			message:
				"Extension npm package @acme/tools is already declared under a different source spec: npm:@acme/tools.",
		});
	});

	test("rejects equivalent normalized local paths under different exact specs", () => {
		expect(
			planDeclaredExtensionInstallToml({
				projectRoot: "/repo/project",
				nsTomlContent: 'extensions = ["./extensions/tools"]\n',
				requestedSpec: "extensions/../extensions/tools",
			}),
		).toMatchObject({
			ok: false,
			reason: "identity-conflict",
			identity: { kind: "local", value: "/repo/project/extensions/tools" },
			requestedSpec: "extensions/../extensions/tools",
			existingSpecs: ["./extensions/tools"],
		});
	});
});

describe("descriptor package exports", () => {
	test("resolves string and conditional descriptor export targets", () => {
		expect(nsExtensionExportTarget({ "./ns-extension": "./src/ns/extension.ts" })).toBe(
			"./src/ns/extension.ts",
		);
		expect(
			nsExtensionExportTarget({
				"./ns-extension": {
					import: "./src/ns/extension.ts",
					default: "./dist/ns/extension.js",
				},
			}),
		).toBe("./src/ns/extension.ts");
		expect(
			nsExtensionExportTarget({
				"./ns-extension": { default: "./dist/ns/extension.js" },
			}),
		).toBe("./dist/ns/extension.js");
		expect(nsExtensionExportTarget({ "./other": "./src/ns/extension.ts" })).toBeUndefined();
	});

	test("resolves descriptor export targets from package manifests", () => {
		expect(
			descriptorExportTarget({
				exports: { "./ns-extension": { default: "./src/ns/extension.ts" } },
			}),
		).toBe("./src/ns/extension.ts");
	});
});

describe("descriptor package acquisition", () => {
	test("resolves npm specs from managed npm storage", () => {
		expect(
			resolveAcquiredDescriptorPackageRoot({ repoRoot: "/repo", spec: "npm:@acme/tools@1.2.3" }),
		).toEqual({ packageRoot: npmPackageRoot("/repo", "@acme/tools") });
	});

	test("always resolves local specs in place", () => {
		expect(
			resolveAcquiredDescriptorPackageRoot({
				repoRoot: "/repo",
				spec: "./extensions/tools",
			}),
		).toEqual({ packageRoot: "/repo/extensions/tools" });
	});
});
