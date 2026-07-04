import { formatErrorMessage } from "./primitives.ts";
import { stripTerminalEscapes } from "./terminal-escapes.ts";

const STARTUP_FAILURE_EXIT_CODE = 127;
export const MAX_ERROR_CHARS = 4_000;

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
	startupError?: string;
}

export type ExecOutputStream = "stdout" | "stderr";
export type ExecOutputListener = (stream: ExecOutputStream, text: string) => void;

export interface ExecOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
	timeoutKillGraceMs?: number;
	signal?: AbortSignal;
	stdin?: string;
	onStdout?: (text: string) => void;
	onStderr?: (text: string) => void;
}

export function outputListenerToExecCallbacks(
	onOutput: ExecOutputListener | undefined,
): Pick<ExecOptions, "onStdout" | "onStderr"> {
	if (onOutput === undefined) return {};
	return {
		onStdout(text) {
			onOutput("stdout", text);
		},
		onStderr(text) {
			onOutput("stderr", text);
		},
	};
}

export type CommandRunner = (
	executable: string,
	args: readonly string[],
	options?: ExecOptions,
) => Promise<ExecResult>;

/**
 * SDL's command execution gateway.
 *
 * This shape is intentionally compatible with Pi's extension-host `ctx.exec`,
 * but SDL's `ExecOptions`/`ExecResult` contract is wider. Code that relies on
 * behavior Pi does not provide, such as stdin piping, must require a narrower
 * capability interface instead of this Pi-compatible base shape.
 */
export interface CommandExecApi {
	exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

/**
 * A CommandExecApi whose exec implementation actually pipes `options.stdin` to the
 * child process. The Pi host `exec` is intentionally NOT branded: it silently drops
 * stdin, so code that drives `git mktree`/`git hash-object` etc. must require this brand.
 */
export interface StdinCapableCommandExecApi extends CommandExecApi {
	readonly supportsStdin: true;
}

export function execApiToCommandRunner(execApi: CommandExecApi): CommandRunner {
	return async (command, args, options) => await execApi.exec(command, [...args], options);
}

export interface PiExecResultLike {
	stdout?: string;
	stderr?: string;
	code: number;
	killed?: boolean;
	startupError?: string;
}

export interface PiExecApiLike {
	exec(command: string, args: string[], options?: ExecOptions): Promise<PiExecResultLike>;
}

export function piExecApiToCommandExecApi(execApi: PiExecApiLike): CommandExecApi {
	return {
		async exec(command, args, options) {
			return normalizeExecResult(await execApi.exec(command, args, options));
		},
	};
}

export interface TailTextOptions {
	maxChars: number;
	maxLines?: number;
}

export type CommandResolver = (name: string) => string | undefined;

export const BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME = "ns:branch-context:from-plan";
export const BRANCH_CONTEXT_UPSTACK_IMPL_FROM_PLAN_COMMAND_NAME =
	"ns:branch-context:upstack-impl-from-plan";
export const IMPL_BRANCH_CONTEXT_COMMAND_NAME = "ns:branch-context:impl-attached-plan";
export const WRITE_PLAN_COMMAND_NAME = "ns:plan:save";
export const WRITE_GRILLED_PLAN_COMMAND_NAME = "ns:plan:grill-and-save";
export const IMPL_CURRENT_SAVED_PLAN_COMMAND_NAME = "ns:plan:impl-current";

/**
 * First tokens of hyphenated skill names that act as Pi command namespaces.
 *
 * When a command-style skill has no entry in {@link SPECIALIZED_SKILL_REPLACEMENTS},
 * `derivePiReplacementSurface` splits its name on the longest matching namespace
 * here: skill `objective-create` → command `objective:create`. A skill whose
 * leading token is not listed falls back to splitting on its first hyphen.
 */
export const KNOWN_PI_COMMAND_NAMESPACES = [
	"branch-context",
	"enriched-plan",
	"objective",
	"handoff",
	"context",
	"changelog",
	"typescript",
	"python",
	"refactor",
	"setup",
	"create",
	"skill",
	"code",
	"ccc",
	"claude",
	"dev",
	"cli",
	"pr",
	"sdl",
	"pi",
	"stack",
] as const;

/**
 * Repo-local skills that Pi surfaces as slash commands instead of native
 * skill invocations.
 *
 * Each name here is expected to resolve to a command surface via
 * `derivePiReplacementSurface`; Pi hides the skill and exposes the derived
 * command, and areg verifies the replacement command actually exists. A skill
 * absent from this list keeps its ordinary `/skill:<name>` surface.
 */
export const COMMAND_STYLE_LOCAL_SKILLS = [
	"branch-context-from-plan",
	"branch-context-impl",
	"branch-retro",
	"ccc-available-work",
	"ccc-branch-triage",
	"ccc-sidebar",
	"ccc-stack-map",
	"changelog-update",
	"ns-flow-autobranch",
	"ns-flow-branch-latest-commit",
	"ns-flow-cp",
	"code-gt-linearize-descendants",
	"code-just-fix",
	"code-just-the-stack",
	"code-resolve-merge-conflicts",
	"code-thermostack",
	"code-workflows",
	"context-bundle-analysis",
	"create-bun-typescript-project",
	"create-python-dev-cli",
	"create-python-package",
	"dignified-python",
	"dignified-python-tripwire",
	"reinvented-abstractions-tripwire",
	"enriched-plan-save",
	"fdt-refactor-mock-to-fake",
	"handoff-create",
	"handoff-pickup",
	"improve-codebase-architecture",
	"objective-close",
	"objective-create",
	"objective-next",
	"objective-refresh",
	"objective-review-briefing",
	"objective-stack-impl",
	"objective-update",
	"pi-grill-ui",
	"pi-grill-with-docs-ui",
	"pytest",
	"python-fake-driven-test-layout",
	"python-fake-driven-testing",
	"refactor-swarm",
	"roast-dry-but-not-too-dry",
	"roast-improve-codebase-architecture",
	"roast-thermonuclear-review",
	"sdl-cli-design",
	"ns-flow-submit",
	"sdl-typescript-style-tripwire",
	"setup-dprint",
	"setup-dprint-gh-ci",
	"setup-graphite",
	"setup-pypi-publish",
	"setup-python-gh-ci",
	"skill-audit",
	"skill-audit-improved",
	"skill-creator",
	"skill-management",
	"skillx",
	"thermo-nuclear-code-quality-review",
	"ts-morph-analyze",
	"ts-morph-refactor",
	"writing-great-skills",
] as const;

/**
 * Skill-name → command-surface overrides where mechanical namespace
 * derivation would produce the wrong command.
 *
 * Covers renames (`pytest` → `python:pytest`, `skillx` → `skill:x`),
 * multi-segment surfaces the single-split rule cannot reach
 * (`ns-flow-cp` → `ns:flow:cp`), and skills bound to the shared command-name
 * constants above. Matching is exact name first, then longest-prefix, so an
 * entry also claims derived variants of skills named `<entry>-<suffix>`.
 */
export const SPECIALIZED_SKILL_REPLACEMENTS = {
	"branch-context-from-plan": BRANCH_CONTEXT_FROM_PLAN_COMMAND_NAME,
	"branch-context-impl": IMPL_BRANCH_CONTEXT_COMMAND_NAME,
	"enriched-plan-save": WRITE_PLAN_COMMAND_NAME,
	"handoff-create": "handoff:create",
	"handoff-pickup": "handoff:pickup",
	"objective-close": "objective:close",
	"objective-create": "objective:create",
	"objective-current": "objective:current",
	"objective-next": "objective:next",
	"objective-stack-impl": "objective:stack-impl",
	"objective-update": "objective:update",
	"pi-grill-ui": "pi:grill-me",
	"pi-grill-with-docs-ui": "pi:grill-with-docs",
	"ns-flow-autobranch": "ns:flow:autobranch",
	"ns-flow-branch-latest-commit": "ns:flow:branch-latest-commit",
	"ns-flow-cp": "ns:flow:cp",
	"code-gt-restack-resolve": "code:gt-restack-resolve",
	"code-just-fix": "code:just-fix",
	"ns-flow-submit": "ns:flow:submit",
	"ccc-sidebar": "ccc:sidebar:pr-summary",
	pytest: "python:pytest",
	skillx: "skill:x",
} as const satisfies Record<string, string>;

/**
 * Command surfaces already claimed by {@link SPECIALIZED_SKILL_REPLACEMENTS}.
 * Generic derivation for other skills must not collide with these;
 * `genericCommandStyleSkillNames` filters out any skill whose derived surface
 * lands in this set.
 */
export const SPECIALIZED_PI_COMMAND_SURFACES = new Set<string>(
	Object.values(SPECIALIZED_SKILL_REPLACEMENTS),
);

export function derivePiReplacementSurface(
	skillName: string,
	namespaces: readonly string[] = KNOWN_PI_COMMAND_NAMESPACES,
): string | undefined {
	for (const [specializedSkillName, surface] of Object.entries(SPECIALIZED_SKILL_REPLACEMENTS).sort(
		(left, right) => right[0].length - left[0].length,
	)) {
		if (skillName === specializedSkillName) return surface;

		const prefix = `${specializedSkillName}-`;
		if (skillName.startsWith(prefix)) return `${surface}-${skillName.slice(prefix.length)}`;
	}

	for (const namespace of [...namespaces].sort((left, right) => right.length - left.length)) {
		const prefix = `${namespace}-`;
		if (skillName.startsWith(prefix)) return `${namespace}:${skillName.slice(prefix.length)}`;
	}

	const firstHyphen = skillName.indexOf("-");
	if (firstHyphen <= 0 || firstHyphen === skillName.length - 1) return undefined;
	return `${skillName.slice(0, firstHyphen)}:${skillName.slice(firstHyphen + 1)}`;
}

export function genericCommandStyleSkillNames(
	skillNames: readonly string[] = COMMAND_STYLE_LOCAL_SKILLS,
): string[] {
	return skillNames.filter((skillName) => {
		if (skillName in SPECIALIZED_SKILL_REPLACEMENTS) return false;
		const surface = derivePiReplacementSurface(skillName);
		return surface !== undefined && !SPECIALIZED_PI_COMMAND_SURFACES.has(surface);
	});
}

export function deriveVisiblePiReplacementSurfaces(
	skillNames: readonly string[] = COMMAND_STYLE_LOCAL_SKILLS,
): string[] {
	const surfaces: string[] = [...SPECIALIZED_PI_COMMAND_SURFACES];
	for (const skillName of genericCommandStyleSkillNames(skillNames)) {
		const surface = derivePiReplacementSurface(skillName);
		if (surface !== undefined) surfaces.push(surface);
	}
	return surfaces;
}

export type CommandBackedSkillRegistrationKind = "generic-backing-skill" | "specialized-command";

export interface CommandBackedSkillRegistration {
	skillName: string;
	surface: string;
	kind: CommandBackedSkillRegistrationKind;
}

export interface SpecializedCommandBackedSkillSpec {
	skillName: string;
	surface: string;
}

export function specializedCommandBackedSkillsFromSpecs(
	specs: readonly SpecializedCommandBackedSkillSpec[],
): readonly CommandBackedSkillRegistration[] {
	return specs.map((spec) => ({
		skillName: spec.skillName,
		surface: spec.surface,
		kind: "specialized-command",
	}));
}

export interface CommandPrefix {
	command: string;
	args: string[];
}

export function normalizeExecResult(result: PiExecResultLike): ExecResult {
	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		code: result.code,
		killed: Boolean(result.killed),
		...(result.startupError === undefined ? {} : { startupError: result.startupError }),
	};
}

export async function runNormalizedExecResult(
	run: () => Promise<PiExecResultLike>,
): Promise<ExecResult> {
	try {
		return normalizeExecResult(await run());
	} catch (error) {
		const startupError = formatErrorMessage(error);
		return {
			stdout: "",
			stderr: startupError,
			code: STARTUP_FAILURE_EXIT_CODE,
			killed: false,
			startupError,
		};
	}
}

export function commandSucceeded(result: ExecResult): boolean {
	return result.code === 0 && !result.killed;
}

export interface FormatCommandEvidenceOptions {
	intro: string;
	command: string;
	cwd: string;
	result: ExecResult;
	guidance?: string;
}

export function formatCommandEvidence(options: FormatCommandEvidenceOptions): string {
	const sections = [
		options.intro,
		`Command: ${options.command}`,
		`Cwd: ${options.cwd}`,
		`Exit: ${options.result.code}`,
		`Killed: ${options.result.killed}`,
	];
	if (options.guidance !== undefined) {
		sections.push(options.guidance);
	}
	sections.push(
		"stdout:",
		formatCommandEvidenceOutput(options.result.stdout),
		"stderr:",
		formatCommandEvidenceOutput(options.result.stderr),
	);
	return sections.join("\n");
}

export function commandFailureReason(result: ExecResult): string {
	const stderr = result.stderr.trim();
	return stderr !== "" ? stderr : `exit code ${result.code}${result.killed ? " (killed)" : ""}`;
}

export function formatCommandError(
	summary: string,
	result: Pick<ExecResult, "stdout" | "stderr" | "code" | "killed">,
): string {
	return [summary, formatCommandDetails(result)].join("\n");
}

export function formatCommandDetails(
	result: Pick<ExecResult, "stdout" | "stderr" | "code" | "killed">,
): string {
	const details = firstNonEmptyTrimmed(result.stderr, result.stdout);
	const killed = result.killed ? " (killed or timed out)" : "";
	return details === ""
		? `exit ${result.code}${killed}`
		: `exit ${result.code}${killed}: ${details}`;
}

export function formatCommand(command: string, args: readonly string[]): string {
	return [command, ...args].map(formatShellArg).join(" ");
}

export function formatCommandResultFailure(
	title: string,
	command: string,
	args: readonly string[],
	result: ExecResult,
): string {
	const displayCommand = formatCommand(command, args);
	if (result.startupError !== undefined) {
		return formatCommandStartupFailure(title, displayCommand, result.startupError);
	}
	return formatCommandFailure(title, displayCommand, result);
}

export function formatShellArg(value: string): string {
	if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
		return value;
	}

	return shellQuote(value);
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function tailText(text: string, options: TailTextOptions): string {
	const maxChars = Math.max(0, Math.trunc(options.maxChars));
	const lineLimited = applyLineLimit(text, options.maxLines);
	let tail = lineLimited.text;

	if (tail.length > maxChars) {
		tail = maxChars === 0 ? "…" : `…${tail.slice(-maxChars)}`;
	}

	if (lineLimited.omittedLines > 0) {
		return `… ${lineLimited.omittedLines} earlier line(s) omitted\n${tail}`;
	}

	return tail;
}

export function formatOutputSection(
	name: "stdout" | "stderr",
	output: string,
	options: TailTextOptions,
): string {
	const normalizedOutput = stripTerminalEscapes(output).replace(/\r/g, "\n").trimEnd();
	const tail = normalizedOutput.length > 0 ? tailText(normalizedOutput, options) : "";
	return [`----- ${name} tail -----`, tail.length > 0 ? tail : "(empty)"].join("\n");
}

function formatCommandEvidenceOutput(output: string): string {
	if (output === "") return "<empty>";
	return output.endsWith("\n") ? output.trimEnd() : output;
}

function firstNonEmptyTrimmed(primary: string, fallback: string): string {
	const primaryDetails = primary.trim();
	if (primaryDetails !== "") return primaryDetails;
	return fallback.trim();
}

export function formatCommandFailure(
	title: string,
	displayCommand: string,
	result: ExecResult,
): string {
	const status = result.killed
		? `exit code ${result.code}; process was killed or timed out`
		: `exit code ${result.code}`;
	return tailText(
		[
			`${title} (${status}).`,
			`Command: ${displayCommand}`,
			formatOutputSection("stdout", result.stdout, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
			formatOutputSection("stderr", result.stderr, { maxChars: MAX_ERROR_CHARS, maxLines: 80 }),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

export function formatCommandStartupFailure(
	title: string,
	displayCommand: string,
	error: unknown,
): string {
	const message = stripTerminalEscapes(formatErrorMessage(error)).replace(/\r/g, "\n").trimEnd();
	return tailText(
		[
			`${title} (failed before completion).`,
			`Command: ${displayCommand}`,
			["error:", message.length > 0 ? message : "(empty)"].join("\n"),
		].join("\n\n"),
		{ maxChars: MAX_ERROR_CHARS, maxLines: 120 },
	);
}

function applyLineLimit(
	text: string,
	maxLines: number | undefined,
): { text: string; omittedLines: number } {
	if (maxLines === undefined) {
		return { text, omittedLines: 0 };
	}

	const normalizedMaxLines = Math.max(0, Math.trunc(maxLines));
	const lines = text.split("\n");
	if (lines.length <= normalizedMaxLines) {
		return { text, omittedLines: 0 };
	}

	if (normalizedMaxLines === 0) {
		return { text: "", omittedLines: lines.length };
	}

	return {
		text: lines.slice(-normalizedMaxLines).join("\n"),
		omittedLines: lines.length - normalizedMaxLines,
	};
}
