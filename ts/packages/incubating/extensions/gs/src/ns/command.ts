import {
	defineCommand,
	type CommandExit,
	type DefineCommandSpec,
	type NsCommand,
	type NsCommandSchema,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import type { z } from "zod";

import type { GsLocalInventoryGateway } from "../core/local-inventory.ts";
import { createNsGsLocalInventoryGateway } from "./local-inventory.ts";

export type GsNsCommandInvocation = Pick<NsExtensionApi, "cwd" | "outputFormat">;

type GsNsCommandOptions<S extends NsCommandSchema, T> = Omit<DefineCommandSpec<S, T>, "handler"> & {
	readonly handler: (
		inventory: GsLocalInventoryGateway,
		invocation: GsNsCommandInvocation,
		request: z.output<S>,
	) => Promise<CommandExit<T>> | CommandExit<T>;
};

export function gsNsCommand<S extends NsCommandSchema, T>(
	options: GsNsCommandOptions<S, T>,
): NsCommand<S, T> {
	return defineCommand({
		...options,
		handler: (ctx, request) => options.handler(createNsGsLocalInventoryGateway(ctx), ctx, request),
	});
}
