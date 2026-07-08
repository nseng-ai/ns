import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
	composePiAgentPrompt,
	findNsPiAgentsDir,
	loadPiAgentDefinition,
	parsePiAgentDefinitionMarkdown,
} from "../src/runtime/agent-definition.ts";

describe("Pi agent definitions", () => {
	test("parses scalar frontmatter, prompt guideline lists, and body", () => {
		const raw = definitionMarkdown({ body: "Body before\n{{prompt}}\nBody after\n" });
		const parsed = parsePiAgentDefinitionMarkdown(raw, "/repo/.ns/pi/agents/runner.md");

		expect(parsed).toEqual({
			schema: "ns.pi-agent.v1",
			name: "runner",
			toolName: "forked_pi_agent",
			label: "Dispatch Forked Pi Session",
			description: "Launch a focused forked Pi process.",
			promptSnippet: "Launch a focused forked Pi process",
			promptGuidelines: [
				"Use forked_pi_agent for focused delegated tasks.",
				"Inspect the returned status.",
			],
			body: "Body before\n{{prompt}}\nBody after\n",
			filePath: "/repo/.ns/pi/agents/runner.md",
		});
	});

	test("rejects missing opening frontmatter delimiter", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown("schema: ns.pi-agent.v1\n---\nBody", "/agent.md"),
		).toThrow(/opening frontmatter delimiter/);
	});

	test("rejects missing closing frontmatter delimiter", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown("---\nschema: ns.pi-agent.v1\nBody", "/agent.md"),
		).toThrow(/closing frontmatter delimiter/);
	});

	test("requires exact first-line frontmatter fences", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown("\n---\nschema: ns.pi-agent.v1\n---\nBody", "/agent.md"),
		).toThrow(/opening frontmatter delimiter/);
		expect(() =>
			parsePiAgentDefinitionMarkdown("--- \nschema: ns.pi-agent.v1\n---\nBody", "/agent.md"),
		).toThrow(/opening frontmatter delimiter/);
		expect(() =>
			parsePiAgentDefinitionMarkdown("---\nschema: ns.pi-agent.v1\n--- \nBody", "/agent.md"),
		).toThrow(/closing frontmatter delimiter/);
	});

	test("rejects the wrong schema", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown(definitionMarkdown({ schema: "ns.pi-agent.v2" }), "/agent.md"),
		).toThrow(/expected ns\.pi-agent\.v1/);
	});

	test("rejects missing required fields with the field name and file path", () => {
		const raw = [
			"---",
			"schema: ns.pi-agent.v1",
			"name: runner",
			"toolName: forked_pi_agent",
			"description: Launch a focused forked Pi process.",
			"---",
			"Body",
		].join("\n");

		expect(() => parsePiAgentDefinitionMarkdown(raw, "/agent.md")).toThrow(/label.*\/agent\.md/);
	});

	test("rejects non-list and malformed promptGuidelines", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown(
				definitionMarkdown({ promptGuidelinesBlock: "promptGuidelines: use the tool\n" }),
				"/agent.md",
			),
		).toThrow(/promptGuidelines.*list/);

		expect(() =>
			parsePiAgentDefinitionMarkdown(
				definitionMarkdown({ promptGuidelinesBlock: "promptGuidelines:\n    - too indented\n" }),
				"/agent.md",
			),
		).toThrow(/expected "  - guideline"/);
	});

	test("finds .ns/pi/agents from a nested cwd", () => {
		const root = tempRoot();
		const nested = join(root, "a", "b", "c");
		mkdirSync(join(root, ".ns", "pi", "agents"), { recursive: true });
		mkdirSync(nested, { recursive: true });

		expect(findNsPiAgentsDir(nested)).toBe(join(root, ".ns", "pi", "agents"));
	});

	test("loads runner.md by name", () => {
		const root = tempRoot();
		writeAgentDefinition(root, "runner", definitionMarkdown({ body: "Runner body {{prompt}}" }));

		const loaded = loadPiAgentDefinition("runner", join(root, "nested"));
		expect(loaded.name).toBe("runner");
		expect(loaded.filePath).toBe(join(root, ".ns", "pi", "agents", "runner.md"));
		expect(loaded.body).toBe("Runner body {{prompt}}");
	});

	test("rejects loaded files whose name does not match the requested agent name", () => {
		const root = tempRoot();
		writeAgentDefinition(root, "runner", definitionMarkdown({ name: "other" }));

		expect(() => loadPiAgentDefinition("runner", root)).toThrow(
			/name mismatch.*requested "runner".*declares "other"/,
		);
	});

	test("composes prompts by replacing supported placeholders without rewriting delegated prompt content", () => {
		const definition = parsePiAgentDefinitionMarkdown(
			definitionMarkdown({ body: "Title: {{title}}\nTask:\n{{prompt}}" }),
			"/agent.md",
		);
		const prompt = "Keep exact braces: {{title}} and trailing spaces  ";

		expect(composePiAgentPrompt(definition, { title: "Focused Slice", prompt })).toBe(
			"Title: Focused Slice\nTask:\nKeep exact braces: {{title}} and trailing spaces  ",
		);
	});

	test("appends a delegated-task section when the body lacks a prompt placeholder", () => {
		const definition = parsePiAgentDefinitionMarkdown(
			definitionMarkdown({ body: "Wrapper {{title}}\n" }),
			"/agent.md",
		);

		expect(
			composePiAgentPrompt(definition, { title: "Slice", prompt: "Do work.\n\nReport back." }),
		).toBe("Wrapper Slice\n\n## Delegated task\n\nDo work.\n\nReport back.");
	});
});

interface DefinitionMarkdownOptions {
	schema?: string;
	name?: string;
	toolName?: string;
	label?: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelinesBlock?: string;
	body?: string;
}

function definitionMarkdown(options: DefinitionMarkdownOptions = {}): string {
	const promptGuidelinesBlock =
		options.promptGuidelinesBlock ??
		[
			"promptGuidelines:",
			"  - Use forked_pi_agent for focused delegated tasks.",
			"  - Inspect the returned status.",
		].join("\n") + "\n";

	return (
		[
			"---",
			`schema: ${options.schema ?? "ns.pi-agent.v1"}`,
			`name: ${options.name ?? "runner"}`,
			`toolName: ${options.toolName ?? "forked_pi_agent"}`,
			`label: ${options.label ?? "Dispatch Forked Pi Session"}`,
			`description: ${options.description ?? "Launch a focused forked Pi process."}`,
			`promptSnippet: ${options.promptSnippet ?? "Launch a focused forked Pi process"}`,
			promptGuidelinesBlock.trimEnd(),
			"---",
		].join("\n") +
		"\n" +
		(options.body ?? "Runner body {{prompt}}\n")
	);
}

function tempRoot(): string {
	return mkdtempSync(join(tmpdir(), "pi-agent-definition-"));
}

function writeAgentDefinition(root: string, agentName: string, content: string): void {
	const agentsDir = join(root, ".ns", "pi", "agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, `${agentName}.md`), content, "utf8");
}
