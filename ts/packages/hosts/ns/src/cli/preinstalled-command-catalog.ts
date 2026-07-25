import harnessArtifactsExtension from "@nseng-ai/harness-artifacts/ns-extension";
import {
	preinstalledNsCommandCatalogFromRegistrations,
	type PreinstalledNsCommandCatalog,
	type PreinstalledNsExtensionRegistration,
} from "@nseng-ai/sdk/cli";
import nsInitExtension from "@nseng-ai/ns-init/ns-extension";

export const preinstalledExtensionRegistrations = [
	{
		packageName: "@nseng-ai/ns-init",
		descriptor: nsInitExtension,
		displayPath: "@nseng-ai/ns-init/ns-extension",
	},
	{
		packageName: "@nseng-ai/harness-artifacts",
		descriptor: harnessArtifactsExtension,
		displayPath: "@nseng-ai/harness-artifacts/ns-extension",
	},
] as const satisfies readonly PreinstalledNsExtensionRegistration[];

export function loadPreinstalledNsCommandCatalog(): PreinstalledNsCommandCatalog {
	return preinstalledNsCommandCatalogFromRegistrations(preinstalledExtensionRegistrations);
}
