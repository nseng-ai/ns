import harnessArtifactsExtension from "../harness-artifacts/ns/extension.ts";
import {
	preinstalledNsCommandCatalogFromRegistrations,
	type PreinstalledNsCommandCatalog,
	type PreinstalledNsExtensionRegistration,
} from "@nseng-ai/sdk/cli";
import nsInitExtension from "../init/ns/extension.ts";

export const preinstalledExtensionRegistrations = [
	{
		packageName: "@nseng-ai/ns",
		descriptor: nsInitExtension,
		displayPath: "@nseng-ai/ns/init/ns-extension",
	},
	{
		packageName: "@nseng-ai/ns",
		descriptor: harnessArtifactsExtension,
		displayPath: "@nseng-ai/ns/harness-artifacts/ns-extension",
	},
] as const satisfies readonly PreinstalledNsExtensionRegistration[];

export function loadPreinstalledNsCommandCatalog(): PreinstalledNsCommandCatalog {
	return preinstalledNsCommandCatalogFromRegistrations(preinstalledExtensionRegistrations);
}
