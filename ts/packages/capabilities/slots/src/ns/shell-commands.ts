import { failure, ok, requireInteractiveOrUsageError } from "@nseng-ai/clinkr";
import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	markerSurfaceShowRequestSchema,
	markerSurfaceShowResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@nseng-ai/capability-kit/shell-support";
import { defineCommand, type NsCommand, type NsExtensionApi } from "@nseng-ai/sdk/sdk";
import { z } from "zod";

import { shellInstallOptionSpecs, shellShowOptionSpecs } from "../core/command-options.ts";

const nsShellIntegrationBeginMarker = "# >>> ns shell integration >>>";
const nsShellIntegrationEndMarker = "# <<< ns shell integration <<<";
const nsShellShowRequestSchema = markerSurfaceShowRequestSchema;
const nsShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
const nsShellShowResultSchema = markerSurfaceShowResultSchema;
const nsShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

function renderNsShellWrapperScript(): string {
	return renderCommandCdWrapperScript({ commandName: "ns" });
}

async function runNsShellShow(
	ctx: NsExtensionApi,
	request: z.output<typeof nsShellShowRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	return ok({ shell: selected.shell, script: renderNsShellWrapperScript() });
}

async function runNsShellInstall(
	ctx: NsExtensionApi,
	request: z.output<typeof nsShellInstallRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		if (ctx.confirm === undefined) {
			const gate = requireInteractiveOrUsageError(
				{ isInteractive: () => false, confirm: async () => ({ type: "aborted" as const }) },
				{
					message: "Installing ns shell integration requires --yes when non-interactive.",
					missingFlag: "--yes",
					howToSupply: "Pass --yes (or -y) to update the shell rc file without prompting.",
				},
			);
			if (gate) return gate;
		}
		const confirmed = await ctx.confirm?.(
			"Install ns shell integration?",
			`Install ns shell integration for ${selected.shell} in ${rcPath}?`,
		);
		if (confirmed !== true) {
			return ok({
				shell: selected.shell,
				rcPath,
				isAlreadyInstalled: false,
				cancelled: true,
			});
		}
	}
	const installed = await installMarkerBlock({
		rcPath,
		beginMarker: nsShellIntegrationBeginMarker,
		payload: renderNsShellWrapperScript(),
		endMarker: nsShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

function renderNsShellShow(result: unknown): string {
	const parsed = nsShellShowResultSchema.parse(result);
	return parsed.script;
}

function renderNsShellInstall(result: unknown): string {
	const parsed = nsShellInstallResultSchema.parse(result);
	if (parsed.cancelled)
		return `Cancelled ns shell integration install for ${parsed.shell} in ${parsed.rcPath}`;
	if (parsed.isAlreadyInstalled)
		return `ns shell integration already installed in ${parsed.rcPath}`;
	return `Installed ns shell integration for ${parsed.shell} in ${parsed.rcPath}`;
}

export function buildNsShellCommands(): NsCommand[] {
	return [
		defineCommand({
			name: "show",
			summary: "Print the parent-shell wrapper script.",
			description: "Print the parent-shell wrapper script.",
			schema: nsShellShowRequestSchema,
			options: shellShowOptionSpecs,
			resultSchema: nsShellShowResultSchema,
			renderHuman: renderNsShellShow,
			handler: runNsShellShow,
		}),
		defineCommand({
			name: "install",
			summary: "Install the parent-shell wrapper in the detected or selected rc file.",
			description: "Install the parent-shell wrapper in the detected or selected rc file.",
			schema: nsShellInstallRequestSchema,
			options: shellInstallOptionSpecs,
			resultSchema: nsShellInstallResultSchema,
			renderHuman: renderNsShellInstall,
			handler: runNsShellInstall,
		}),
	];
}
