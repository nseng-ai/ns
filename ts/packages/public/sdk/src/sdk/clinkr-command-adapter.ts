import { defineCommand, type ContextfulCommandDefinition } from "@nseng-ai/clinkr/app";
import {
	defineRawCommand,
	type ContextfulRawCommandDefinition,
	type ContextfulRawCommandOptions,
} from "@nseng-ai/clinkr/raw";
import type { z } from "zod";

import type { NsExtensionApi } from "./execution.ts";

export function createContextfulCommand<S extends z.ZodObject, T>(
	definition: ContextfulCommandDefinition<NsExtensionApi, S, z.ZodType<T>>,
): ContextfulCommandDefinition<NsExtensionApi, S, z.ZodType<T>> {
	return defineCommand(definition);
}

export function createContextfulRawCommand(
	options: ContextfulRawCommandOptions<NsExtensionApi>,
): ContextfulRawCommandDefinition<NsExtensionApi> {
	return defineRawCommand(options);
}
