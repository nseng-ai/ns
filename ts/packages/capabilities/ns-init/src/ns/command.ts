import {
	createNsDomainCommand,
	type NsDomainCommandOptions,
} from "@nseng-ai/capability-kit/ns-command";
import type { NsCommand, NsCommandSchema } from "@nseng-ai/kernel/sdk";

import type { ExtensionInstallContext } from "../install-extension.ts";
import type { ExtensionUninstallContext } from "../uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../update-extension.ts";
import { createNsInitContext } from "./context.ts";

type NsInitCommandContext = ExtensionInstallContext &
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
