import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findWorkspaceRootByMarkers } from "@nseng-ai/capability-kit/workspace-root";
import {
	PI_AGENT_DEFINITION_SCHEMA,
	loadPiAgentDefinition,
	parsePiAgentDefinitionMarkdown,
} from "@nseng-ai/pi/runtime/agent-definition";
import { describe, expect, test } from "vitest";

import {
	EXPLORER_AGENT_NAME,
	EXPLORER_AGENT_REPO_RELATIVE_PATH,
	EXPLORER_SCOUT_SECTION_HEADERS,
} from "../../src/explore/contract.ts";

function workspaceRoot(): string {
	const root = findWorkspaceRootByMarkers({
		cwd: fileURLToPath(new URL(".", import.meta.url)),
		markers: [EXPLORER_AGENT_REPO_RELATIVE_PATH],
		exists: existsSync,
	});
	if (root === null) {
		throw new Error(`Could not find ${EXPLORER_AGENT_REPO_RELATIVE_PATH} from contract test.`);
	}
	return root;
}

describe("explorer contract", () => {
	test("the real explorer prompt scout section headings match the contract", () => {
		const root = workspaceRoot();
		const explorerAgentPath = join(root, EXPLORER_AGENT_REPO_RELATIVE_PATH);
		const explorerAgentMarkdown = readFileSync(explorerAgentPath, "utf8");
		const definition = parsePiAgentDefinitionMarkdown(explorerAgentMarkdown, explorerAgentPath);
		const bodyHeadings = definition.body
			.split("\n")
			.filter((line) => line.startsWith("## "))
			.slice(0, EXPLORER_SCOUT_SECTION_HEADERS.length);

		expect(definition.schema).toBe(PI_AGENT_DEFINITION_SCHEMA);
		expect(bodyHeadings).toEqual([...EXPLORER_SCOUT_SECTION_HEADERS]);
	});

	test("the real explorer agent definition loads from the workspace root", () => {
		const definition = loadPiAgentDefinition(EXPLORER_AGENT_NAME, workspaceRoot());

		expect(definition.name).toBe(EXPLORER_AGENT_NAME);
		expect(definition.filePath).toContain(EXPLORER_AGENT_REPO_RELATIVE_PATH);
	});
});
