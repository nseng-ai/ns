import {
	defineCommand,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { ExtensionInstallContext } from "../install-extension.ts";
import type { ExtensionListContext } from "../list-extensions.ts";
import type { ExtensionUninstallContext } from "../uninstall-extension.ts";
import type { ExtensionUpdateContext } from "../update-extension.ts";
import { createNsInitContext } from "./context.ts";

type NsInitCommandContext = ExtensionInstallContext &
	ExtensionListContext &
	ExtensionUninstallContext &
	ExtensionUpdateContext & { cwd: string };

interface NsInitCommandOptions<S extends NsCommandSchema, T> extends Omit<
	DefineCommandSpec<S, T>,
	"handler"
> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly handler: (
		context: NsInitCommandContext,
		request: z.output<S>,
	) => ReturnType<DefineCommandSpec<S, T>["handler"]>;
}

export function nsInitCommand<S extends NsCommandSchema, T>(
	options: NsInitCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineCommand({
		schema: options.schema,
		...(options.resultSchema === undefined ? {} : { resultSchema: options.resultSchema }),
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.completionProvider === undefined
			? {}
			: { completionProvider: options.completionProvider }),
		...(options.renderHuman === undefined ? {} : { renderHuman: options.renderHuman }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (context, request) =>
			options.handler(await createNsInitContext(context), request),
	});
}
