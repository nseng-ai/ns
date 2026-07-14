import { OBJECTIVE_RUNNER_CHILD_FORBIDDEN_ACTIONS_RULE } from "./objective-runner-rules.ts";
import type { ObjectiveSelectionSpec } from "./objective-selection.ts";

export type ObjectiveCliSubcommand = "next" | "update" | "close" | "autorun";
export type ObjectiveCommandName = `ns:objective:${ObjectiveCliSubcommand}`;
export type ObjectiveSkillName = `objective-${ObjectiveCliSubcommand}`;
export type ObjectiveCreateCommandName = "ns:objective:create";
export type ObjectiveCreateSkillName = "objective-create";

export interface ObjectiveCommandSpec extends ObjectiveSelectionSpec {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveSkillName;
	cliSubcommand: ObjectiveCliSubcommand;
	description: string;
	fallbackPrompt: string;
	actionPrompt: string;
	postSelectionReminder?: string;
}

export interface ObjectiveCreateSkillSpec {
	description: string;
	actionPrompt: string;
}

export type ObjectiveCreateCommandSpec = ObjectiveCreateSkillSpec & {
	commandName: ObjectiveCreateCommandName;
	skillName: ObjectiveCreateSkillName;
};

type ObjectiveCommandSpecInput = Omit<ObjectiveCommandSpec, "commandName" | "statusKey">;

export const OBJECTIVE_CREATE_COMMAND_NAME: ObjectiveCreateCommandName = "ns:objective:create";

function objectiveCommandName(cliSubcommand: ObjectiveCliSubcommand): ObjectiveCommandName {
	return `ns:objective:${cliSubcommand}`;
}

function deriveSpec<TInput extends object, TDerived extends object>(
	spec: TInput,
	derive: (spec: TInput) => TDerived,
): TInput & TDerived {
	return {
		...spec,
		...derive(spec),
	};
}

function defineObjectiveCommandSpec(spec: ObjectiveCommandSpecInput): ObjectiveCommandSpec {
	return deriveSpec(spec, ({ cliSubcommand }) => {
		const commandName = objectiveCommandName(cliSubcommand);
		return {
			commandName,
			statusKey: commandName,
		};
	});
}

export const objectiveCreateCommandSpec: ObjectiveCreateCommandSpec = {
	commandName: OBJECTIVE_CREATE_COMMAND_NAME,
	skillName: "objective-create",
	description:
		"Read objective-create backing Markdown to interview for and create a new Objective. Objective patterns are offered during the interview.",
	actionPrompt: "Run objective-create with this initial user request:",
};

/** Every Pi command spec that expands an Objective-creation backing skill. */
export const allObjectiveCreateCommandSpecs: ObjectiveCreateCommandSpec[] = [
	objectiveCreateCommandSpec,
];

const OBJECTIVE_AUTORUN_PI_TOOL_REMINDER = `

Pi session note: use the \`objective_runner_step\` tool for each runner step instead of hand-running \`ns objective exec runner-begin\`, dispatching a subagent yourself, and \`ns objective exec runner-finish\`. The tool owns the mechanical step, live progress widget, and fresh report/facts scratch paths for every call, including recovery attempts. The parent session still owns every judgment checkpoint: derive thin guidance, read each returned Runner Checkpoint, decide continue/recover/stop, route Semantic Updates through objective-update between steps, and honor this canonical forbidden-action rule: "${OBJECTIVE_RUNNER_CHILD_FORBIDDEN_ACTIONS_RULE}". To recover a failed step, call the tool again with \`recover: true\` and sharpened guidance. Never mutate the worktree while a tool call is running.`;

export const objectiveCommandSpecs: ObjectiveCommandSpec[] = [
	defineObjectiveCommandSpec({
		skillName: "objective-next",
		cliSubcommand: "next",
		description:
			"Pick an active Objective, then invoke objective-next to recommend, steer planning, or offer confirmed execution when Objective policy allows it.",
		selectionTitle: "Select an active Objective for next work or execution preview",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway for the explicit Objective below: apply the Tracking Gate, auto-run objective-update before continuing when clear current-branch or worktree progress for this same Objective is missing from tracking, recommend the next useful work, and include a best-effort work-left estimate as semantic steps or slices, not calendar time. Estimate either until Objective completion or, when the remaining path is unclear, until the next discovery or decision step where additional work can be identified. Only offer execution when the Objective contains explicit Runner Policy / Definition of Progress prose allowing it. If execution is offered, present an upfront preview and wait for explicit confirmation before material action. Do not use hidden ledgers, task files, private queues, Branch Memory run state, or alternate Objective stores. Do not submit PRs or perform external side effects unless included in the confirmed preview scope.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nThis explicit objective-next invocation preauthorizes update-and-continue when the Tracking Gate finds clear material current-branch or worktree progress for this same Objective that is absent from Objective tracking: run objective-update for this selected Objective, reread the Objective and repo evidence, reapply the gate, then continue. Ask before updating only when evidence, Objective fit, or update scope is ambiguous.",
		selectionMode: "advancement",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-update",
		cliSubcommand: "update",
		description: "Pick an active Objective, then invoke objective-update for the selected slug.",
		selectionTitle: "Select an active Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-update's normal post-selection evidence workflow.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-close",
		cliSubcommand: "close",
		description: "Pick an active Objective, then invoke objective-close for the selected slug.",
		selectionTitle: "Select an active Objective to close",
		fallbackPrompt:
			"The objective-close skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: close exactly one explicit Objective below only after confirming the closure outcome/rationale, then add ## Closure and closed.md without deleting, moving, or reopening the Objective.",
		actionPrompt: "Run objective-close for this explicitly selected Objective slug or path:",
		postSelectionReminder:
			"\nAfter this explicit selection, follow objective-close's normal closure confirmation workflow before mutating Objective files.",
	}),
	defineObjectiveCommandSpec({
		skillName: "objective-autorun",
		cliSubcommand: "autorun",
		description:
			"Pick an active Objective, then invoke objective-autorun to drive it through repeated verified runner steps.",
		selectionTitle: "Select an active Objective to autorun",
		fallbackPrompt:
			"The objective-autorun skill was not found among loaded Pi skills. Follow the repository's Objective Runner workflow anyway for the explicit Objective below: drive it through repeated decomposed runner steps (ns objective exec runner-begin, one dispatched subagent, ns objective exec runner-finish), reading each Runner Checkpoint and making an explicit continue, recover, or stop decision between steps. Route tracking through objective-update between steps only. Every implementation child and Runner step is local-only and external-write-forbidden. Parent publication is off by default; use it only through an implemented parent-only publisher after a committed checkpoint and tracking judgment, when durable Runner Policy plus exact human-confirmed Objective/branch/existing-PR/head binding authorize this invocation. Never substitute raw push or PR mutation, and never create a PR, submit/restack, force-push, merge, land, or deploy.",
		actionPrompt:
			"Run objective-autorun with this Objective selection and launch scope (slug/path plus optional scope, step budget, and standing guidance):",
		postSelectionReminder: OBJECTIVE_AUTORUN_PI_TOOL_REMINDER,
		selectionMode: "advancement",
	}),
];
