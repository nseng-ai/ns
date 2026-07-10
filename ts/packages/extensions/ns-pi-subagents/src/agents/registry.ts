import type { PiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";

import type { SubagentRuntimeKind } from "../runtime/seam.ts";

export const BUILT_IN_SUBAGENT_AGENT_NAMES = ["explorer", "task"] as const;
export type BuiltInSubagentAgentName = (typeof BUILT_IN_SUBAGENT_AGENT_NAMES)[number];
export type SubagentAgentName = BuiltInSubagentAgentName | (string & {});

export interface SubagentAgentDescriptor {
	readonly name: SubagentAgentName;
	readonly definitionPath: string;
	readonly minTasks: number;
	readonly maxTasks: number;
	readonly maxConcurrency: number;
	readonly wallClockMs?: number;
	readonly tools: readonly string[];
	readonly promptContext: "definition-only" | "curated-worktree";
	readonly modelPolicy: "inherit" | "explorer-same-model-retry";
	readonly maxTaskFinalTextChars: number;
	readonly maxFleetFinalTextChars?: number;
	readonly supportedRuntimes: readonly SubagentRuntimeKind[];
	readonly runtimePreference: readonly SubagentRuntimeKind[];
}

export interface SubagentAgentCatalogEntry {
	readonly descriptor: SubagentAgentDescriptor;
	readonly definition?: PiAgentDefinition;
	readonly diagnostic?: string;
}

export interface SubagentAgentRegistry {
	readonly names: readonly string[];
	readonly entries: readonly SubagentAgentCatalogEntry[];
	get(name: string): SubagentAgentCatalogEntry | undefined;
}

export function createSubagentAgentRegistry(
	descriptors: readonly SubagentAgentDescriptor[],
	loadDefinition: (name: string) => PiAgentDefinition,
): SubagentAgentRegistry {
	const entries: SubagentAgentCatalogEntry[] = [];
	const names = new Set<string>();
	for (const descriptor of descriptors) {
		validateDescriptor(descriptor);
		if (names.has(descriptor.name)) throw new Error(`Duplicate subagent agent: ${descriptor.name}`);
		names.add(descriptor.name);
		try {
			const definition = loadDefinition(descriptor.name);
			const diagnostic = definitionDiagnostic(descriptor, definition);
			entries.push(
				diagnostic === undefined
					? { descriptor, definition }
					: { descriptor, definition, diagnostic },
			);
		} catch (error) {
			entries.push({
				descriptor,
				diagnostic: `${descriptor.definitionPath} could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
	}
	const byName = new Map(entries.map((entry) => [entry.descriptor.name, entry]));
	return { names: [...names], entries, get: (name) => byName.get(name) };
}

export function definitionDiagnostic(
	descriptor: SubagentAgentDescriptor,
	definition: PiAgentDefinition,
): string | undefined {
	if (definition.name !== descriptor.name) {
		return `${definition.filePath} declares name "${definition.name}"; expected "${descriptor.name}".`;
	}
	if (definition.toolName !== "subagent") {
		return `${definition.filePath} declares toolName "${definition.toolName}"; expected "subagent".`;
	}
	return undefined;
}

function validateDescriptor(descriptor: SubagentAgentDescriptor): void {
	if (descriptor.name.trim().length === 0)
		throw new Error("Subagent agent name must not be empty.");
	if (descriptor.minTasks < 1 || descriptor.maxTasks < descriptor.minTasks) {
		throw new Error(`Invalid task limits for subagent agent ${descriptor.name}.`);
	}
	if (descriptor.maxConcurrency < 1 || descriptor.maxConcurrency > descriptor.maxTasks) {
		throw new Error(`Invalid concurrency for subagent agent ${descriptor.name}.`);
	}
	if (descriptor.maxTaskFinalTextChars < 1) {
		throw new Error(`Subagent agent ${descriptor.name} must allow final text.`);
	}
	if (descriptor.supportedRuntimes.length === 0 || descriptor.runtimePreference.length === 0) {
		throw new Error(`Subagent agent ${descriptor.name} must support and prefer a runtime.`);
	}
	if (!descriptor.runtimePreference.every((kind) => descriptor.supportedRuntimes.includes(kind))) {
		throw new Error(`Subagent agent ${descriptor.name} prefers an unsupported runtime.`);
	}
}

export function buildSubagentCatalog(entries: readonly SubagentAgentCatalogEntry[]): string {
	return entries
		.filter((entry) => entry.diagnostic === undefined && entry.definition !== undefined)
		.map((entry) => `${entry.descriptor.name}: ${entry.definition?.description ?? ""}`)
		.join("\n");
}
