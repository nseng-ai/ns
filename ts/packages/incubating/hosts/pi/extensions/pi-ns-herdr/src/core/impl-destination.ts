import type { HerdrGateway, PreparedLaunchDestination } from "@nseng-ai/herdr/api";

export type ImplDestination = "workspace" | "tab";

export type PrepareImplDestinationResult =
	| { readonly type: "ready"; readonly destination: PreparedLaunchDestination }
	| { readonly type: "failed"; readonly message: string };

/**
 * Prepare the Prepared Herdr Launch destination for an implementation command.
 *
 * The workspace case is a pure transformation with no caller-context I/O. The
 * tab case resolves the explicit caller space through the Herdr gateway; call
 * this at the command boundary, before idle waiting, Git inspection,
 * interaction, or mutation. A failed resolution stops the workflow with a
 * caller-space diagnostic; there is no environment or UI-focus fallback.
 */
export async function prepareImplDestination(options: {
	destination: ImplDestination;
	commandName: string;
	herdr: Pick<HerdrGateway, "resolveCallerContext">;
}): Promise<PrepareImplDestinationResult> {
	if (options.destination === "workspace") {
		return { type: "ready", destination: { type: "workspace" } };
	}
	const resolved = await options.herdr.resolveCallerContext();
	if (resolved.type === "failed") {
		return {
			type: "failed",
			message: `/${options.commandName} requires a Herdr caller space, but the caller context could not be resolved.\n${resolved.message}`,
		};
	}
	return {
		type: "ready",
		destination: { type: "tab", callerWorkspaceId: resolved.context.workspaceId },
	};
}

export function formatImplDestinationNoun(destination: ImplDestination): "space" | "tab" {
	return destination === "workspace" ? "space" : "tab";
}
