import { z } from "zod";

import type {
	CommandResult,
	EnvelopeWithSchemaOptions,
	ExtensionAPI,
	ExtensionContext,
} from "./extension.ts";

interface ExecNsJsonRuntime {
	readonly pi: ExtensionAPI;
	readonly commandTimeoutMs: number;
	parseEnvelopeWithSchema<T>(options: EnvelopeWithSchemaOptions<T>): CommandResult<T>;
}

interface ExecNsJsonOptions<T> {
	readonly runtime: ExecNsJsonRuntime;
	readonly ctx: ExtensionContext;
	readonly args: readonly string[];
	readonly label: string;
	readonly schema: z.ZodType<T>;
	readonly allowFailureData?: boolean;
}

export async function execNsJson<T>(options: ExecNsJsonOptions<T>): Promise<CommandResult<T>> {
	const result = await options.runtime.pi.exec("ns", [...options.args], {
		cwd: options.ctx.cwd,
		timeout: options.runtime.commandTimeoutMs,
	});
	return options.runtime.parseEnvelopeWithSchema({
		label: options.label,
		result,
		schema: options.schema,
		...(options.allowFailureData === undefined
			? {}
			: { allowFailureData: options.allowFailureData }),
	});
}
