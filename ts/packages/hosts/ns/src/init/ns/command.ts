import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/extension-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/sdk";

import type { ExtensionInstallContext } from "../install-extension.ts";
import type { ExtensionListContext } from "../list-extensions.ts";
import type { ExtensionUninstallContext } from "../uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../update-extension.ts";
import { createNsInitContext } from "./context.ts";

type NsInitCommandContext = ExtensionInstallContext &
	ExtensionListContext &
	ExtensionUninstallContext &
	ExtensionUpdateContext & { cwd: string };

type NsInitCommandOptions<S extends NsCommandSchema, T> = Omit<
	NsDomainCommandOptions<S, T, NsInitCommandContext>,
	"createContext"
>;

export function nsInitCommand<S extends NsCommandSchema, T>(
	options: NsInitCommandOptions<S, T>,
): NsCommand<S, T> {
	return createNsDomainCommand({
		...options,
		createContext: createNsInitContext,
	});
}
