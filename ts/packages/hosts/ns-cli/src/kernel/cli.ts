export {
	buildCli,
	extensionDescriptorToPreinstalledCatalog,
	listNsCommands,
	NS_BUILT_IN_HELP_GROUP,
	repoLocalNsCommandDescriptorToPreinstalledCatalogEntry,
	repoLocalNsExtensionToPreinstalledCatalog,
	runCli,
	VERSION,
} from "@nseng-ai/kernel/cli";
export type {
	BuildNsCliOptions,
	NsCliDeps,
	NsCommandInfo,
	PreinstalledNsCommandCatalogEntry,
	PreinstalledNsCommandCatalogLoader,
} from "@nseng-ai/kernel/cli";
export type { NsCliContext } from "@nseng-ai/kernel/cli";
