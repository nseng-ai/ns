import {
	installMarkerBlock,
	markerSurfaceInstallRequestSchema,
	markerSurfaceInstallResultSchema,
	rcPathForShell,
	renderCommandCdWrapperScript,
	resolveRequestedShell,
} from "@nseng-ai/extension-kit/shell-support";
import { defineCommand, failure, ok, type NsExtensionApi } from "@nseng-ai/sdk";
import { z } from "zod";

import { shellInstallOptionSpecs } from "../../../../../core/command-options.ts";

const nsShellIntegrationBeginMarker = "# >>> ns shell integration >>>";
const nsShellIntegrationEndMarker = "# <<< ns shell integration <<<";
const nsShellInstallRequestSchema = markerSurfaceInstallRequestSchema.extend({
	yes: z.boolean().default(false).describe("Confirm shell rc-file update without prompting."),
});
const nsShellInstallResultSchema = markerSurfaceInstallResultSchema.extend({
	cancelled: z.boolean().default(false),
});

export async function command() {
	return defineCommand({
		name: "install",
		summary: "Install the parent-shell wrapper in the detected or selected rc file.",
		description: "Install the parent-shell wrapper in the detected or selected rc file.",
		schema: nsShellInstallRequestSchema,
		options: shellInstallOptionSpecs,
		resultSchema: nsShellInstallResultSchema,
		handler: runNsShellInstall,
		renderHuman: renderNsShellInstall,
	});
}

async function runNsShellInstall(
	ctx: NsExtensionApi,
	request: z.output<typeof nsShellInstallRequestSchema>,
) {
	const selected = resolveRequestedShell(request.shell, ctx.env);
	if (selected.type === "failure") return failure(selected.failure.type, selected.failure.message);
	const rcPath = rcPathForShell(selected.shell, ctx.env);
	if (!request.yes) {
		const confirmation = await ctx.confirm(
			"Install ns shell integration?",
			`Install ns shell integration for ${selected.shell} in ${rcPath}?`,
		);
		if (confirmation.type !== "confirmed") {
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
		payload: renderCommandCdWrapperScript({ commandName: "ns" }),
		endMarker: nsShellIntegrationEndMarker,
	});
	return ok({
		shell: selected.shell,
		rcPath: installed.rcPath,
		isAlreadyInstalled: installed.isAlreadyInstalled,
		cancelled: false,
	});
}

function renderNsShellInstall(result: unknown): string {
	const parsed = nsShellInstallResultSchema.parse(result);
	if (parsed.cancelled)
		return `Cancelled ns shell integration install for ${parsed.shell} in ${parsed.rcPath}`;
	if (parsed.isAlreadyInstalled)
		return `ns shell integration already installed in ${parsed.rcPath}`;
	return `Installed ns shell integration for ${parsed.shell} in ${parsed.rcPath}`;
}
