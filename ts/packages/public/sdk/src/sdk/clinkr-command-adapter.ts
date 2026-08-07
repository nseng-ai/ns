import type { ContextfulCommandDefinition } from "@nseng-ai/clinkr/app";
import {
	defineRawCommand,
	type ContextfulRawCommandDefinition,
	type ContextfulRawCommandOptions,
} from "@nseng-ai/clinkr/raw";
import type { z } from "zod";

import type { NsExtensionApi } from "./execution.ts";

export function createContextfulCommand<S extends z.ZodObject, TResultSchema extends z.ZodType>(
	definition: ContextfulCommandDefinition<NsExtensionApi, S, TResultSchema>,
): ContextfulCommandDefinition<NsExtensionApi, S, TResultSchema> {
	return definition;
}

export function createContextfulRawCommand(
	options: ContextfulRawCommandOptions<NsExtensionApi>,
): ContextfulRawCommandDefinition<NsExtensionApi> {
	return defineRawCommand(options);
}
