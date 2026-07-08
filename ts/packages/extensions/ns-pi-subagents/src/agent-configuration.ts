import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type { PiAgentDefinition } from "@nseng-ai/pi/runtime/agent-definition";

export type AgentDefinitionConfigurationCheck =
	| { ok: true; definition: PiAgentDefinition }
	| { ok: false; diagnostic: string };

export interface SubagentToolRegistration {
	isHealthy: boolean;
}

export interface AgentDefinitionConfigurationOptions {
	agentName: string;
	cwd: string;
	toolName: string;
	loadAgentDefinition(agentName: string, cwd: string): PiAgentDefinition;
	requiredFilePath: string;
	validateDefinition?: (definition: PiAgentDefinition) => string | undefined;
}

export function checkAgentDefinitionConfiguration(
	options: AgentDefinitionConfigurationOptions,
): AgentDefinitionConfigurationCheck {
	let definition: PiAgentDefinition;
	try {
		definition = options.loadAgentDefinition(options.agentName, options.cwd);
	} catch (error) {
		return {
			ok: false,
			diagnostic: `${options.requiredFilePath} is required for ${options.toolName} but could not be loaded: ${formatErrorMessage(error)}`,
		};
	}
	if (definition.toolName !== options.toolName) {
		return {
			ok: false,
			diagnostic: `${definition.filePath} declares toolName "${definition.toolName}"; expected "${options.toolName}".`,
		};
	}
	const validationDiagnostic = options.validateDefinition?.(definition);
	if (validationDiagnostic !== undefined) {
		return { ok: false, diagnostic: validationDiagnostic };
	}
	return { ok: true, definition };
}

export function agentConfigurationErrorText(options: {
	toolName: string;
	agentKind: string;
	requiredFilePath: string;
	diagnostic: string;
}): string {
	return [
		`${options.toolName} is unavailable because its ${options.agentKind} agent definition is misconfigured.`,
		`Expected ${options.requiredFilePath} to exist and declare toolName: ${options.toolName}.`,
		`Diagnostic: ${options.diagnostic}`,
	].join("\n");
}
