import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
	composePiAgentPrompt,
	findAsdlPiAgentsDir,
	loadPiAgentDefinition,
	parsePiAgentDefinitionMarkdown,
} from "../src/pi-agent-definition.ts";

describe("Pi agent definitions", () => {
	test("parses scalar frontmatter, prompt guideline lists, and body", () => {
		const raw = definitionMarkdown({ body: "Body before\n{{prompt}}\nBody after\n" });
		const parsed = parsePiAgentDefinitionMarkdown(raw, "/repo/.asdl/pi/agents/runner.md");

		expect(parsed).toEqual({
			schema: "asdl.pi-agent.v1",
			name: "runner",
			toolName: "dispatch_runner_subagent",
			label: "Dispatch Runner Subagent",
			description: "Launch a focused subagent Pi session.",
			promptSnippet: "Launch a focused subagent Pi session",
			promptGuidelines: ["Use dispatch_runner_subagent for focused delegated tasks.", "Inspect the returned status."],
			body: "Body before\n{{prompt}}\nBody after\n",
			filePath: "/repo/.asdl/pi/agents/runner.md",
		});
	});

	test("rejects missing opening frontmatter delimiter", () => {
		expect(() => parsePiAgentDefinitionMarkdown("schema: asdl.pi-agent.v1\n---\nBody", "/agent.md")).toThrow(
			/opening frontmatter delimiter/,
		);
	});

	test("rejects missing closing frontmatter delimiter", () => {
		expect(() => parsePiAgentDefinitionMarkdown("---\nschema: asdl.pi-agent.v1\nBody", "/agent.md")).toThrow(
			/closing frontmatter delimiter/,
		);
	});

	test("rejects the wrong schema", () => {
		expect(() => parsePiAgentDefinitionMarkdown(definitionMarkdown({ schema: "asdl.pi-agent.v2" }), "/agent.md")).toThrow(
			/expected asdl\.pi-agent\.v1/,
		);
	});

	test("rejects missing required fields with the field name and file path", () => {
		const raw = [
			"---",
			"schema: asdl.pi-agent.v1",
			"name: runner",
			"toolName: dispatch_runner_subagent",
			"description: Launch a focused subagent Pi session.",
			"---",
			"Body",
		].join("\n");

		expect(() => parsePiAgentDefinitionMarkdown(raw, "/agent.md")).toThrow(/label.*\/agent\.md/);
	});

	test("rejects non-list and malformed promptGuidelines", () => {
		expect(() =>
			parsePiAgentDefinitionMarkdown(definitionMarkdown({ promptGuidelinesBlock: "promptGuidelines: use the tool\n" }), "/agent.md"),
		).toThrow(/promptGuidelines.*list/);

		expect(() =>
			parsePiAgentDefinitionMarkdown(definitionMarkdown({ promptGuidelinesBlock: "promptGuidelines:\n    - too indented\n" }), "/agent.md"),
		).toThrow(/expected "  - guideline"/);
	});

	test("finds .asdl/pi/agents from a nested cwd", () => {
		const root = tempRoot();
		const nested = join(root, "a", "b", "c");
		mkdirSync(join(root, ".asdl", "pi", "agents"), { recursive: true });
		mkdirSync(nested, { recursive: true });

		expect(findAsdlPiAgentsDir(nested)).toBe(join(root, ".asdl", "pi", "agents"));
	});

	test("loads runner.md by name", () => {
		const root = tempRoot();
		writeAgentDefinition(root, "runner", definitionMarkdown({ body: "Runner body {{prompt}}" }));

		const loaded = loadPiAgentDefinition("runner", join(root, "nested"));
		expect(loaded.name).toBe("runner");
		expect(loaded.filePath).toBe(join(root, ".asdl", "pi", "agents", "runner.md"));
		expect(loaded.body).toBe("Runner body {{prompt}}");
	});

	test("rejects loaded files whose name does not match the requested agent name", () => {
		const root = tempRoot();
		writeAgentDefinition(root, "runner", definitionMarkdown({ name: "other" }));

		expect(() => loadPiAgentDefinition("runner", root)).toThrow(/name mismatch.*requested "runner".*declares "other"/);
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
		const definition = parsePiAgentDefinitionMarkdown(definitionMarkdown({ body: "Wrapper {{title}}\n" }), "/agent.md");

		expect(composePiAgentPrompt(definition, { title: "Slice", prompt: "Do work.\n\nReport back." })).toBe(
			"Wrapper Slice\n\n## Delegated task\n\nDo work.\n\nReport back.",
		);
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
			"  - Use dispatch_runner_subagent for focused delegated tasks.",
			"  - Inspect the returned status.",
		].join("\n") +
			"\n";

	return [
		"---",
		`schema: ${options.schema ?? "asdl.pi-agent.v1"}`,
		`name: ${options.name ?? "runner"}`,
		`toolName: ${options.toolName ?? "dispatch_runner_subagent"}`,
		`label: ${options.label ?? "Dispatch Runner Subagent"}`,
		`description: ${options.description ?? "Launch a focused subagent Pi session."}`,
		`promptSnippet: ${options.promptSnippet ?? "Launch a focused subagent Pi session"}`,
		promptGuidelinesBlock.trimEnd(),
		"---",
	].join("\n") +
		"\n" +
		(options.body ?? "Runner body {{prompt}}\n");
}

function tempRoot(): string {
	return mkdtempSync(join(tmpdir(), "pi-agent-definition-"));
}

function writeAgentDefinition(root: string, agentName: string, content: string): void {
	const agentsDir = join(root, ".asdl", "pi", "agents");
	mkdirSync(agentsDir, { recursive: true });
	writeFileSync(join(agentsDir, `${agentName}.md`), content, "utf8");
}
