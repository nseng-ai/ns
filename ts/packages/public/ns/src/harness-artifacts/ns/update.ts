import { failure, type CommandOutcome } from "@nseng-ai/clinkr/app";
import { z } from "zod";

import type { SkillsCommandContext } from "./skills-shared.ts";

export const nsUpdateRequestSchema = z.object({});
export const nsUpdateCliRequestSchema = nsUpdateRequestSchema;
export const nsUpdateResultSchema = z.object({
	update: z.literal("self"),
	isImplemented: z.literal(false),
});

export type NsUpdateRequest = z.output<typeof nsUpdateRequestSchema>;
export type NsUpdateCliRequest = z.output<typeof nsUpdateCliRequestSchema>;
export type NsUpdateResult = z.output<typeof nsUpdateResultSchema>;

export async function runNsUpdateCli(
	_context: SkillsCommandContext,
	_request: NsUpdateCliRequest,
): Promise<CommandOutcome<NsUpdateResult>> {
	return selfUpdateNotImplemented();
}

export async function runNsUpdate(
	context: SkillsCommandContext,
	request: NsUpdateRequest,
): Promise<CommandOutcome<NsUpdateResult>> {
	return await runNsUpdateCli(context, request);
}

export function renderNsUpdateHuman(result: NsUpdateResult): string {
	return result.isImplemented ? "ns self-update complete." : "ns self-update is not implemented.";
}

function selfUpdateNotImplemented(): CommandOutcome<NsUpdateResult> {
	return failure(
		"self-update-not-implemented",
		"ns self-update is not implemented yet; use ns extension update <source> to update one declared extension.",
		{ nextCommand: "ns extension update <source>" },
	);
}
