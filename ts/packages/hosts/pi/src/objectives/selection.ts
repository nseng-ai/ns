import {
	buildObjectiveSkillPrompt,
	chooseActiveObjectiveSlug,
	type BuildObjectiveSkillPromptOptions,
	type ObjectiveSelectionContext,
	type ObjectiveSelectionHost,
	type ObjectiveSelectionListLoadResult,
	type ObjectiveSelectionNotifyLevel,
	type ObjectiveSelectionSpec,
	type ObjectiveSelectionUi,
	type ObjectiveSkillPromptSpec,
} from "@sdl/objective/api";
import { formatCommand, formatCommandFailure, formatCommandStartupFailure } from "@sdl/core/exec";
import { parseObjectiveList } from "./list.ts";
import type { CommandContext } from "../cmux/types.ts";

const OBJECTIVE_COMMAND_TIMEOUT_MS = 30_000;
const chooseActiveObjectiveSlugFromApi = chooseActiveObjectiveSlug;

async function chooseActiveObjectiveSlugWithCli(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<string | undefined> {
	return chooseActiveObjectiveSlugFromApi(withObjectiveCliSelectionHost(host), ctx, spec);
}

export function withObjectiveCliSelectionHost<T extends ObjectiveSelectionHost>(
	host: T,
): T & ObjectiveSelectionHost {
	if (host.loadObjectiveList !== undefined) {
		return host;
	}
	return new Proxy(host, {
		get(target, property, receiver) {
			if (property === "loadObjectiveList") {
				return (ctx: ObjectiveSelectionContext, spec: ObjectiveSelectionSpec) =>
					listActiveObjectivesViaCli(target, ctx, spec);
			}
			const value = Reflect.get(target, property, receiver) as unknown;
			return typeof value === "function" ? value.bind(target) : value;
		},
	}) as T & ObjectiveSelectionHost;
}

async function listActiveObjectivesViaCli(
	host: ObjectiveSelectionHost,
	ctx: ObjectiveSelectionContext,
	spec: ObjectiveSelectionSpec,
): Promise<ObjectiveSelectionListLoadResult> {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(spec.statusKey, "listing active Objectives…");
	}

	const args = ["list", "--minimal", "--format", "json"];
	try {
		const result = await host.exec("objective", args, {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_COMMAND_TIMEOUT_MS,
		});
		if (result.code !== 0 || result.killed) {
			return {
				type: "failed",
				message: formatCommandFailure(
					"objective command failed",
					formatCommand("objective", args),
					result,
				),
			};
		}

		const parsedList = parseObjectiveList(result.stdout);
		if (parsedList.type === "invalid") {
			return { type: "failed", message: parsedList.message };
		}
		return { type: "loaded", list: parsedList.list };
	} catch (error) {
		return {
			type: "failed",
			message: formatCommandStartupFailure(
				"objective command failed",
				formatCommand("objective", args),
				error,
			),
		};
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus?.(spec.statusKey, undefined);
		}
	}
}

export { buildObjectiveSkillPrompt, chooseActiveObjectiveSlugWithCli as chooseActiveObjectiveSlug };

export type {
	BuildObjectiveSkillPromptOptions,
	ObjectiveSelectionContext,
	ObjectiveSelectionHost,
	ObjectiveSelectionListLoadResult,
	ObjectiveSelectionNotifyLevel,
	ObjectiveSelectionSpec,
	ObjectiveSelectionUi,
	ObjectiveSkillPromptSpec,
};

export function objectiveSelectionContextFromCommandContext(
	ctx: CommandContext,
): ObjectiveSelectionContext {
	const selectSource = ctx.ui.select;
	const select: ObjectiveSelectionContext["ui"]["select"] | undefined =
		selectSource === undefined
			? undefined
			: (title, options) => selectSource.call(ctx.ui, title, [...options]);
	const setStatus: ObjectiveSelectionContext["ui"]["setStatus"] | undefined =
		ctx.ui.setStatus?.bind(ctx.ui);
	return {
		cwd: ctx.cwd,
		hasUI: ctx.hasUI === true,
		ui: {
			notify: ctx.ui.notify.bind(ctx.ui),
			...(select === undefined ? {} : { select }),
			...(setStatus === undefined ? {} : { setStatus }),
		},
		waitForIdle: ctx.waitForIdle.bind(ctx),
	};
}
