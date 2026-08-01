import { getCallerWorkspaceId, type PreparedLaunchDestination } from "@nseng-ai/herdr/api";

export type ImplDestination = "workspace" | "tab";

export type PrepareImplDestinationResult =
	| { readonly type: "ready"; readonly destination: PreparedLaunchDestination }
	| { readonly type: "failed"; readonly message: string };

export function prepareImplDestination(
	destination: ImplDestination,
	commandName: string,
): PrepareImplDestinationResult {
	if (destination === "workspace") {
		return { type: "ready", destination: { type: "workspace" } };
	}
	const callerWorkspaceId = getCallerWorkspaceId();
	if (callerWorkspaceId === undefined) {
		return {
			type: "failed",
			message: `/${commandName} requires HERDR_WORKSPACE_ID. Run it from a Herdr caller space.`,
		};
	}
	return { type: "ready", destination: { type: "tab", callerWorkspaceId } };
}

export function formatImplDestinationNoun(destination: ImplDestination): "space" | "tab" {
	return destination === "workspace" ? "space" : "tab";
}
