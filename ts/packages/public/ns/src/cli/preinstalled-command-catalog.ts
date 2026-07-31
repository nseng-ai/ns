import harnessArtifactsExtension from "../harness-artifacts/ns/extension.ts";
import {
	NS_BUILT_IN_HELP_GROUP,
	preinstalledNsCommandCatalogFromRegistrations,
	type PreinstalledNsCommandCatalog,
	type PreinstalledNsExtensionRegistration,
} from "@nseng-ai/sdk/cli";
import nsInitExtension from "../init/ns/extension.ts";

/**
 * Top-level commands that ship inside the ns binary and read as part of the tool
 * itself, so help lists them under Built-ins rather than Extensions.
 */
const BUILT_IN_TOP_LEVEL_COMMAND_NAMES: ReadonlySet<string> = new Set([
	"extension",
	"init",
	"skills",
	"update",
]);

function builtInTopLevelHelpGroup(segments: readonly string[]): string | undefined {
	const topLevelName = segments[0];
	if (topLevelName !== undefined && BUILT_IN_TOP_LEVEL_COMMAND_NAMES.has(topLevelName)) {
		return NS_BUILT_IN_HELP_GROUP;
	}
	return undefined;
}

export const preinstalledExtensionRegistrations = [
	{
		packageName: "@nseng-ai/ns",
		userFacingKind: "built-in",
		descriptor: nsInitExtension,
		displayPath: "@nseng-ai/ns/init/ns-extension",
		entryHelpGroup: (_entry, segments) => builtInTopLevelHelpGroup(segments),
	},
	{
		packageName: "@nseng-ai/ns",
		userFacingKind: "built-in",
		descriptor: harnessArtifactsExtension,
		displayPath: "@nseng-ai/ns/harness-artifacts/ns-extension",
		entryHelpGroup: (_entry, segments) => builtInTopLevelHelpGroup(segments),
	},
] as const satisfies readonly PreinstalledNsExtensionRegistration[];

export function loadPreinstalledNsCommandCatalog(): PreinstalledNsCommandCatalog {
	return preinstalledNsCommandCatalogFromRegistrations(preinstalledExtensionRegistrations);
}
