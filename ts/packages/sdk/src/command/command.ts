import type { NsContext } from "./catalog.ts";
import type { HostableRun } from "./hostable.ts";

export interface CommandDefinition<TRun = (...args: never[]) => unknown> {
	readonly name: string;
	readonly summary: string;
	readonly description: string;
	readonly run: TRun;
}

export interface DefineCommandOptions<TRun> {
	readonly name: string;
	readonly summary: string;
	readonly description?: string;
	readonly run: TRun;
}

export type ComposableCommand = CommandDefinition<HostableRun<never, never, unknown>>;

const composableCommandBrand = Symbol.for("@nseng-ai/sdk/command/composable");

export type DefinedCommand<TRun> = CommandDefinition<TRun> & {
	readonly [composableCommandBrand]: true;
};

export function defineCommand<TRun>(options: DefineCommandOptions<TRun>): DefinedCommand<TRun> {
	return {
		name: options.name,
		summary: options.summary,
		description: options.description ?? options.summary,
		run: options.run,
		[composableCommandBrand]: true,
	};
}

export function isComposableCommand(
	value: unknown,
): value is DefinedCommand<(...args: never[]) => unknown> {
	return typeof value === "object" && value !== null && composableCommandBrand in value;
}

export type { NsContext };
