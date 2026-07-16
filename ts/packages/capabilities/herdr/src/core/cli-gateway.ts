import {
	commandSucceeded,
	type CommandExecApi,
	formatCommand,
	formatCommandFailure,
	tailText,
} from "@nseng-ai/foundation/command";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";

import type { HerdrGateway, HerdrWorkspaceRenameResult } from "./herdr-gateway.ts";

const HERDR_CLI_TIMEOUT_MS = 15_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_ERROR_LINES = 20;

/**
 * CLI-backed HerdrGateway adapter. All operations call the installed `herdr`
 * binary; no raw socket integration is included. The CLI is Herdr's recommended
 * automation surface for ordinary scripting.
 */
export function createCliHerdrGateway(exec: CommandExecApi): HerdrGateway {
	return {
		async renameWorkspace(workspaceId, label): Promise<HerdrWorkspaceRenameResult> {
			return renameWorkspace(exec, workspaceId, label);
		},
	};
}

async function renameWorkspace(
	exec: CommandExecApi,
	workspaceId: string,
	label: string,
): Promise<HerdrWorkspaceRenameResult> {
	const command = "herdr";
	const args = ["workspace", "rename", workspaceId, label];
	const commandDisplay = formatCommand(command, args);
	try {
		const result = await exec.exec(command, args, { timeout: HERDR_CLI_TIMEOUT_MS });
		if (!commandSucceeded(result)) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"Could not apply Herdr Objective sidebar label.",
					commandDisplay,
					result,
				),
			};
		}
		return { type: "applied" };
	} catch (error) {
		return {
			type: "failed",
			message: tailText(
				`Could not apply Herdr Objective sidebar label.\nCommand: ${commandDisplay}\nError: ${formatErrorMessage(error)}`,
				{ maxChars: MAX_ERROR_CHARS, maxLines: MAX_ERROR_LINES },
			),
		};
	}
}
