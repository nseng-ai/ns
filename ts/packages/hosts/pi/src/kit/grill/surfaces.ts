export const GRILL_UI_COMMAND_NAME = "pi:grill-me";
export const GRILL_WITH_DOCS_UI_COMMAND_NAME = "pi:grill-with-docs";
export const GRILL_ASK_TOOL_NAME = "grill_ask";
export const GRILL_UI_SKILL_NAME = "pi-grill-ui";
export const GRILL_WITH_DOCS_UI_SKILL_NAME = "pi-grill-with-docs-ui";

/** Narrow host contract for reading and replacing the active model-visible tool set. */
export interface GrillAskActiveToolsHost {
	getActiveTools(): string[];
	setActiveTools(names: string[]): void;
}

/**
 * Idempotently add `grill_ask` to the host's active tool set, preserving every
 * currently active tool and their order. No-op when already active.
 */
export function activateGrillAskTool(host: GrillAskActiveToolsHost): void {
	const active = host.getActiveTools();
	if (active.includes(GRILL_ASK_TOOL_NAME)) return;
	host.setActiveTools([...active, GRILL_ASK_TOOL_NAME]);
}

/**
 * Idempotently remove only `grill_ask` from the host's active tool set,
 * preserving every other active tool. No-op when already inactive.
 */
export function deactivateGrillAskTool(host: GrillAskActiveToolsHost): void {
	const active = host.getActiveTools();
	if (!active.includes(GRILL_ASK_TOOL_NAME)) return;
	host.setActiveTools(active.filter((name) => name !== GRILL_ASK_TOOL_NAME));
}
