import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { installMarkerBlock, rcPathForShell, resolveRequestedShell, type SupportedShell } from "./rc-install.ts";

export const markerSurfaceShowRequestSchema = z.object({
	shell: z.string().optional().describe("Shell to render output for (zsh or bash). Defaults from $SHELL, then zsh."),
});

export const markerSurfaceInstallRequestSchema = markerSurfaceShowRequestSchema;

export const markerSurfaceShowResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	script: z.string(),
});

export const markerSurfaceInstallResultSchema = z.object({
	shell: z.union([z.literal("zsh"), z.literal("bash")]),
	rc_path: z.string(),
	is_already_installed: z.boolean(),
});

export type MarkerSurfaceShowRequest = z.infer<typeof markerSurfaceShowRequestSchema>;
export type MarkerSurfaceInstallRequest = z.infer<typeof markerSurfaceInstallRequestSchema>;
export type MarkerSurfaceShowResult = z.infer<typeof markerSurfaceShowResultSchema>;
export type MarkerSurfaceInstallResult = z.infer<typeof markerSurfaceInstallResultSchema>;

export interface MarkerInstallSurfaceConfig {
	readonly beginMarker: string;
	readonly endMarker: string;
	readonly renderPayload: (shell: SupportedShell) => string;
	readonly alreadyInstalledMessage: (result: MarkerSurfaceInstallResult) => string;
	readonly installedMessage: (result: MarkerSurfaceInstallResult) => string;
}

export function buildMarkerInstallSurface(config: MarkerInstallSurfaceConfig) {
	return {
		showRequestSchema: markerSurfaceShowRequestSchema,
		installRequestSchema: markerSurfaceInstallRequestSchema,
		showResultSchema: markerSurfaceShowResultSchema,
		installResultSchema: markerSurfaceInstallResultSchema,
		async runShow(ctx: SlotCliContext, request: MarkerSurfaceShowRequest) {
			const selected = resolveRequestedShell(request.shell, ctx.env);
			if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
			return ok({ shell: selected.shell, script: config.renderPayload(selected.shell) });
		},
		async runInstall(ctx: SlotCliContext, request: MarkerSurfaceInstallRequest) {
			const selected = resolveRequestedShell(request.shell, ctx.env);
			if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
			const payload = config.renderPayload(selected.shell);
			const rcPath = rcPathForShell(selected.shell, ctx.env);
			const installed = await installMarkerBlock({ rcPath, beginMarker: config.beginMarker, payload, endMarker: config.endMarker });
			return ok({ shell: selected.shell, rc_path: installed.rcPath, is_already_installed: installed.isAlreadyInstalled });
		},
		renderShow(result: MarkerSurfaceShowResult): string {
			return result.script;
		},
		renderInstall(result: MarkerSurfaceInstallResult): string {
			if (result.is_already_installed) return config.alreadyInstalledMessage(result);
			return config.installedMessage(result);
		},
	};
}
