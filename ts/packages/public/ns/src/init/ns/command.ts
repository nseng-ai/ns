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

interface NsInitCommandOptions<
	S extends NsCommandSchema,
	TResultSchema extends z.ZodType,
> extends Omit<DefineCommandSpec<S, TResultSchema>, "handler"> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly handler: (
		context: NsInitCommandContext,
		request: z.output<S>,
	) => ReturnType<DefineCommandSpec<S, TResultSchema>["handler"]>;
}

export function nsInitCommand<S extends NsCommandSchema, TResultSchema extends z.ZodType>(
	options: NsInitCommandOptions<S, TResultSchema>,
): NsCommand<S, TResultSchema> {
	return defineCommand({
		schema: options.schema,
		resultSchema: options.resultSchema,
		renderHuman: options.renderHuman,
		...(options.positionals === undefined ? {} : { positionals: options.positionals }),
		...(options.options === undefined ? {} : { options: options.options }),
		...(options.completionProvider === undefined
			? {}
			: { completionProvider: options.completionProvider }),
		...(options.renderMarkdown === undefined ? {} : { renderMarkdown: options.renderMarkdown }),
		handler: async (context, request) =>
			options.handler(await createNsInitContext(context), request),
	});
}
