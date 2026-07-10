import type { ToolContext } from "@nseng-ai/pi/runtime/tool-types";

import {
	dispatchRunnerSubagent,
	type RunnerSubagentContext,
	type RunnerSubagentOptions,
	type RunnerSubagentPi,
	type RunnerSubagentResult,
} from "../runner-subagents/index.ts";

export interface SubagentRuntimeDispatchInput {
	readonly pi: RunnerSubagentPi;
	readonly ctx: RunnerSubagentContext;
	readonly options: RunnerSubagentOptions;
}

export interface SubagentRuntime {
	dispatch(input: SubagentRuntimeDispatchInput): Promise<RunnerSubagentResult>;
}

export const SUBAGENT_RUNTIME_KINDS = ["subprocess", "in-process"] as const;
export type SubagentRuntimeKind = (typeof SUBAGENT_RUNTIME_KINDS)[number];
export type SubagentExecution = "auto" | SubagentRuntimeKind;

export interface SubagentRuntimeAdapter {
	readonly kind: SubagentRuntimeKind;
	create(
		ctx: ToolContext,
	): { ok: true; runtime: SubagentRuntime } | { ok: false; diagnostic: string };
}

export interface SubagentRuntimeRegistry {
	readonly kinds: readonly SubagentRuntimeKind[];
	resolve(input: {
		ctx: ToolContext;
		execution: SubagentExecution;
		supported: readonly SubagentRuntimeKind[];
		preference: readonly SubagentRuntimeKind[];
	}):
		| { ok: true; kind: SubagentRuntimeKind; runtime: SubagentRuntime }
		| { ok: false; diagnostic: string };
}

export function createSubagentRuntimeRegistry(
	adapters: readonly SubagentRuntimeAdapter[],
): SubagentRuntimeRegistry {
	const byKind = new Map<SubagentRuntimeKind, SubagentRuntimeAdapter>();
	for (const adapter of adapters) {
		if (byKind.has(adapter.kind)) throw new Error(`Duplicate subagent runtime: ${adapter.kind}`);
		byKind.set(adapter.kind, adapter);
	}
	const kinds = [...byKind.keys()];
	return {
		kinds,
		resolve(input) {
			const requested = input.execution === "auto" ? input.preference : [input.execution];
			const compatible = requested.filter(
				(candidate) => input.supported.includes(candidate) && byKind.has(candidate),
			);
			const unavailable: string[] = [];
			for (const kind of compatible) {
				const adapter = byKind.get(kind);
				if (adapter === undefined) continue;
				const created = adapter.create(input.ctx);
				if (created.ok) return { ok: true, kind, runtime: created.runtime };
				unavailable.push(created.diagnostic);
				if (input.execution !== "auto") break;
			}
			return {
				ok: false,
				diagnostic:
					unavailable.join(" ") ||
					`No compatible subagent runtime. Requested ${input.execution}; supported: ${input.supported.join(", ")}; available: ${kinds.join(", ") || "none"}.`,
			};
		},
	};
}

export type SubagentRuntimeDispatchFunction = (
	input: SubagentRuntimeDispatchInput,
) => Promise<RunnerSubagentResult>;

export function createSubprocessSubagentRuntime(): SubagentRuntime {
	return {
		async dispatch(input) {
			return await dispatchRunnerSubagent(input.pi, input.ctx, input.options);
		},
	};
}

export function createFunctionSubagentRuntime(
	dispatch: SubagentRuntimeDispatchFunction,
): SubagentRuntime {
	return { dispatch };
}
