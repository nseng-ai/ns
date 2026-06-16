import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { splitMarkdownFrontmatter, stripLineEnding } from "@asdl/core/markdown-frontmatter";
import { formatErrorMessage } from "@asdl/core/primitives";

export const PI_AGENT_DEFINITION_SCHEMA = "asdl.pi-agent.v1";

export interface PiAgentDefinition {
	schema: typeof PI_AGENT_DEFINITION_SCHEMA;
	name: string;
	toolName: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines: string[];
	body: string;
	filePath: string;
}

type SupportedFrontmatterField =
	| "schema"
	| "name"
	| "toolName"
	| "label"
	| "description"
	| "promptSnippet"
	| "promptGuidelines";

type FrontmatterValue = string | string[];
type FrontmatterFields = Partial<Record<SupportedFrontmatterField, FrontmatterValue>>;

const SUPPORTED_FRONTMATTER_FIELDS = new Set<string>([
	"schema",
	"name",
	"toolName",
	"label",
	"description",
	"promptSnippet",
	"promptGuidelines",
]);

export function findAsdlPiAgentsDir(cwd: string): string | undefined {
	let current = resolve(cwd);
	while (true) {
		const candidate = join(current, ".asdl", "pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export function loadPiAgentDefinition(agentName: string, cwd: string): PiAgentDefinition {
	if (!isSafeAgentName(agentName)) {
		throw new Error(
			`Invalid Pi agent name "${agentName}". Agent names must be a single path segment containing only letters, numbers, underscores, or hyphens.`,
		);
	}

	const agentsDir = findAsdlPiAgentsDir(cwd);
	if (agentsDir === undefined) {
		throw new Error(`Could not find .asdl/pi/agents while walking up from ${cwd}.`);
	}

	const filePath = join(agentsDir, `${agentName}.md`);
	if (!existsSync(filePath)) {
		throw new Error(`Pi agent definition "${agentName}" not found at ${filePath}.`);
	}

	let raw: string;
	try {
		raw = readFileSync(filePath, "utf8");
	} catch (error) {
		throw new Error(`Failed to read Pi agent definition "${agentName}" at ${filePath}: ${formatErrorMessage(error)}`);
	}

	const definition = parsePiAgentDefinitionMarkdown(raw, filePath);
	if (definition.name !== agentName) {
		throw new Error(
			`Pi agent definition name mismatch in ${filePath}: requested "${agentName}" but file declares "${definition.name}".`,
		);
	}
	return definition;
}

export function parsePiAgentDefinitionMarkdown(raw: string, filePath: string): PiAgentDefinition {
	const split = splitMarkdownFrontmatter(raw);
	if (split.type === "not_found") {
		throw new Error(`Pi agent definition ${filePath} must start with an opening frontmatter delimiter "---".`);
	}
	if (split.type === "missing_closing_fence") {
		throw new Error(`Pi agent definition ${filePath} is missing a closing frontmatter delimiter "---".`);
	}

	const frontmatterLines = split.block.frontmatterLinesWithEndings.map((line) => stripLineEnding(line).replace(/\r$/u, ""));
	const body = split.block.body.replace(/\r\n?/gu, "\n");
	const fields = parseFrontmatterLines(frontmatterLines, filePath);
	return validatePiAgentDefinition(fields, body, filePath);
}

export function composePiAgentPrompt(definition: PiAgentDefinition, input: { title: string; prompt: string }): string {
	const body = definition.body.trim();
	const hasPromptPlaceholder = body.includes("{{prompt}}");
	const composed = body.replace(/\{\{(prompt|title)\}\}/g, (_match, key: string) => {
		return key === "prompt" ? input.prompt : input.title;
	});

	if (hasPromptPlaceholder) return composed;

	const delegatedTask = `## Delegated task\n\n${input.prompt}`;
	if (composed.length === 0) return delegatedTask;
	return `${composed}\n\n${delegatedTask}`;
}

function parseFrontmatterLines(lines: string[], filePath: string): FrontmatterFields {
	const fields: FrontmatterFields = {};
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		const lineNumber = index + 2;
		if (line.trim().length === 0) {
			index += 1;
			continue;
		}
		if (/^\s/.test(line)) {
			throw new Error(`Malformed frontmatter in ${filePath} on line ${lineNumber}: unexpected indented line.`);
		}

		const match = /^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/.exec(line);
		if (!match) {
			throw new Error(`Malformed frontmatter in ${filePath} on line ${lineNumber}: expected "key: value".`);
		}

		const key = match[1] ?? "";
		const rawValue = match[2] ?? "";
		if (!isSupportedFrontmatterField(key)) {
			throw new Error(`Unsupported frontmatter field "${key}" in ${filePath} on line ${lineNumber}.`);
		}
		if (fields[key] !== undefined) {
			throw new Error(`Duplicate frontmatter field "${key}" in ${filePath} on line ${lineNumber}.`);
		}

		if (key === "promptGuidelines") {
			if (rawValue.trim().length > 0) {
				throw new Error(`Field "promptGuidelines" in ${filePath} must be a list of "  - guideline" items.`);
			}
			const { items, nextIndex } = parsePromptGuidelineList(lines, index + 1, filePath);
			fields.promptGuidelines = items;
			index = nextIndex;
			continue;
		}

		const value = rawValue.trim();
		if (value.length === 0) {
			throw new Error(`Field "${key}" in ${filePath} must be a non-empty string.`);
		}
		fields[key] = value;
		index += 1;
	}

	return fields;
}

function parsePromptGuidelineList(
	lines: string[],
	startIndex: number,
	filePath: string,
): { items: string[]; nextIndex: number } {
	const items: string[] = [];
	let index = startIndex;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (line.trim().length === 0) {
			index += 1;
			continue;
		}
		if (!/^\s/.test(line)) break;

		const match = /^  -\s+(.+)$/.exec(line);
		if (!match) {
			throw new Error(`Malformed promptGuidelines list in ${filePath} on line ${index + 2}: expected "  - guideline".`);
		}

		const item = (match[1] ?? "").trim();
		if (item.length === 0) {
			throw new Error(`Malformed promptGuidelines list in ${filePath} on line ${index + 2}: empty guideline.`);
		}
		items.push(item);
		index += 1;
	}

	if (items.length === 0) {
		throw new Error(`Field "promptGuidelines" in ${filePath} must include at least one list item when present.`);
	}

	return { items, nextIndex: index };
}

function validatePiAgentDefinition(fields: FrontmatterFields, body: string, filePath: string): PiAgentDefinition {
	const schema = requiredScalarField(fields, "schema", filePath);
	if (schema !== PI_AGENT_DEFINITION_SCHEMA) {
		throw new Error(
			`Invalid Pi agent definition schema in ${filePath}: expected ${PI_AGENT_DEFINITION_SCHEMA}, got ${schema}.`,
		);
	}

	const name = requiredScalarField(fields, "name", filePath);
	const toolName = requiredScalarField(fields, "toolName", filePath);
	const label = requiredScalarField(fields, "label", filePath);
	const description = requiredScalarField(fields, "description", filePath);
	const promptSnippet = optionalScalarField(fields, "promptSnippet", filePath);
	const promptGuidelines = optionalStringListField(fields, "promptGuidelines", filePath) ?? [];

	return {
		schema: PI_AGENT_DEFINITION_SCHEMA,
		name,
		toolName,
		label,
		description,
		...(promptSnippet === undefined ? {} : { promptSnippet }),
		promptGuidelines,
		body,
		filePath,
	};
}

function requiredScalarField(fields: FrontmatterFields, key: SupportedFrontmatterField, filePath: string): string {
	const value = fields[key];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Missing required field "${key}" in Pi agent definition ${filePath}.`);
	}
	return value.trim();
}

function optionalScalarField(fields: FrontmatterFields, key: SupportedFrontmatterField, filePath: string): string | undefined {
	const value = fields[key];
	if (value === undefined) return undefined;
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error(`Field "${key}" in Pi agent definition ${filePath} must be a non-empty string.`);
	}
	return value.trim();
}

function optionalStringListField(fields: FrontmatterFields, key: SupportedFrontmatterField, filePath: string): string[] | undefined {
	const value = fields[key];
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
		throw new Error(`Field "${key}" in Pi agent definition ${filePath} must be a list of strings.`);
	}
	return value.map((item) => item.trim());
}

function isSupportedFrontmatterField(field: string): field is SupportedFrontmatterField {
	return SUPPORTED_FRONTMATTER_FIELDS.has(field);
}

function isSafeAgentName(agentName: string): boolean {
	return /^[A-Za-z0-9_-]+$/.test(agentName);
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		// Any filesystem failure means the path is not a usable agents directory.
		return false;
	}
}
