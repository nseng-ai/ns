const PLAN_RECIPE_BRAND = Symbol.for("@asdl/ts-plans/recipe");

export interface DefinePlanInput {
	title?: string;
	summary?: string;
	goal: string;
	context?: string;
	phases: readonly DefinePlanPhaseInput[];
}

export interface DefinePlanPhaseInput {
	title: string;
	prompt?: string;
	tasks: readonly string[];
}

export interface PlanRecipeMetadata {
	title?: string;
	summary?: string;
}

export interface PlanRecipeRuntime {
	readonly cwd: string;
	readonly signal: AbortSignal | undefined;
	goal(text: string): void;
	context(text: string): void;
	phase(title: string, body: PlanRecipePhaseBody): Promise<void>;
	task(prompt: string): void;
	note(text: string): void;
	validateWithShell(command: string): void;
}

export type PlanRecipePhaseBody = () => void | Promise<void>;
export type PlanRecipeFunction = (plan: PlanRecipeRuntime) => void | Promise<void>;

export interface TsPlanRecipe {
	readonly [PLAN_RECIPE_BRAND]: true;
}

export type TsPlanRecipePreviewFormat = "text" | "mermaid";

export interface RenderRecipeOptions {
	key: string;
	cwd: string;
	format: TsPlanRecipePreviewFormat;
	signal?: AbortSignal | undefined;
}

export interface RenderedRecipe {
	content: string;
	title?: string;
	summary?: string;
}

export type RenderRecipeResult = { type: "success"; rendered: RenderedRecipe } | { type: "failure"; message: string };

type RecipeKind = "declarative" | "imperative";
type NormalizedPlanItem = { type: "note"; text: string } | { type: "validation"; command: string } | { type: "task"; prompt: string };

interface NormalizedPlanPhase {
	title: string;
	prompt?: string;
	tasks: readonly string[];
	notes: readonly string[];
	validations: readonly string[];
}

interface NormalizedPlan {
	title?: string;
	summary?: string;
	goal: string;
	context?: string;
	phases: readonly NormalizedPlanPhase[];
	finalItems: readonly NormalizedPlanItem[];
}

interface DeclarativeRecipe extends TsPlanRecipe {
	kind: "declarative";
	plan: NormalizedPlan;
}

interface ImperativeRecipe extends TsPlanRecipe {
	kind: "imperative";
	metadata: PlanRecipeMetadata;
	run: PlanRecipeFunction;
}

type BrandedRecipe = DeclarativeRecipe | ImperativeRecipe;

type ValidationResult<T> = { type: "success"; value: T } | { type: "failure"; message: string };

interface MutablePlanPhase {
	title: string;
	prompt?: string;
	tasks: string[];
	notes: string[];
	validations: string[];
}

interface MutablePlan {
	title?: string;
	summary?: string;
	goal: string;
	context?: string;
	phases: MutablePlanPhase[];
	finalItems: NormalizedPlanItem[];
}

export function definePlan(input: DefinePlanInput): TsPlanRecipe {
	const result = normalizeDefinePlanInput(input);
	if (result.type === "failure") {
		throw new Error(result.message);
	}

	const recipe: DeclarativeRecipe = {
		[PLAN_RECIPE_BRAND]: true,
		kind: "declarative",
		plan: result.value,
	};
	return recipe;
}

export function planRecipe(metadata: PlanRecipeMetadata, fn: PlanRecipeFunction): TsPlanRecipe {
	const normalizedMetadata = normalizePlanRecipeMetadata(metadata);
	if (normalizedMetadata.type === "failure") {
		throw new Error(normalizedMetadata.message);
	}

	if (typeof fn !== "function") {
		throw new Error("planRecipe callback must be a function.");
	}

	const recipe: ImperativeRecipe = {
		[PLAN_RECIPE_BRAND]: true,
		kind: "imperative",
		metadata: normalizedMetadata.value,
		run: fn,
	};
	return recipe;
}

export async function renderTsPlanRecipe(value: unknown, options: RenderRecipeOptions): Promise<RenderRecipeResult> {
	if (isAbortSignalAborted(options.signal)) {
		return { type: "failure", message: "Preview aborted." };
	}

	const recipe = normalizeBrandedRecipe(value);
	if (recipe.type === "failure") {
		return recipe;
	}

	const planResult = await evaluateRecipe(recipe.value, options);
	if (planResult.type === "failure") {
		return planResult;
	}

	const rendered = renderNormalizedPlan(planResult.value, options.format);
	return { type: "success", rendered };
}

function normalizeDefinePlanInput(input: unknown): ValidationResult<NormalizedPlan> {
	const record = expectPlainRecord(input, "plan");
	if (record.type === "failure") return record;

	const keys = validateObjectKeys(record.value, ["title", "summary", "goal", "context", "phases"], "plan");
	if (keys.type === "failure") return keys;

	const title = normalizeOptionalStringField(record.value, "title", "plan.title");
	if (title.type === "failure") return title;

	const summary = normalizeOptionalStringField(record.value, "summary", "plan.summary");
	if (summary.type === "failure") return summary;

	const goal = normalizeRequiredStringField(record.value, "goal", "plan.goal");
	if (goal.type === "failure") return goal;

	const context = normalizeOptionalStringField(record.value, "context", "plan.context");
	if (context.type === "failure") return context;

	const rawPhases = record.value.phases;
	if (!Array.isArray(rawPhases)) {
		return { type: "failure", message: "plan.phases must be an array." };
	}

	if (rawPhases.length === 0) {
		return { type: "failure", message: "plan.phases must contain at least one phase." };
	}

	const phases: NormalizedPlanPhase[] = [];
	for (const [index, rawPhase] of rawPhases.entries()) {
		const phase = normalizeDefinePlanPhaseInput(rawPhase, `plan.phases[${index}]`);
		if (phase.type === "failure") return phase;
		phases.push(phase.value);
	}

	return {
		type: "success",
		value: buildNormalizedPlan({
			title: title.value,
			summary: summary.value,
			goal: goal.value,
			context: context.value,
			phases,
			finalItems: [],
		}),
	};
}

function normalizeDefinePlanPhaseInput(input: unknown, path: string): ValidationResult<NormalizedPlanPhase> {
	const record = expectPlainRecord(input, path);
	if (record.type === "failure") return record;

	const keys = validateObjectKeys(record.value, ["title", "prompt", "tasks"], path);
	if (keys.type === "failure") return keys;

	const title = normalizeRequiredStringField(record.value, "title", `${path}.title`);
	if (title.type === "failure") return title;

	const prompt = normalizeOptionalStringField(record.value, "prompt", `${path}.prompt`);
	if (prompt.type === "failure") return prompt;

	const rawTasks = record.value.tasks;
	if (!Array.isArray(rawTasks)) {
		return { type: "failure", message: `${path}.tasks must be an array.` };
	}

	if (rawTasks.length === 0 && prompt.value === undefined) {
		return { type: "failure", message: `${path}.tasks may be empty only when prompt is non-empty.` };
	}

	const tasks: string[] = [];
	for (const [index, rawTask] of rawTasks.entries()) {
		if (typeof rawTask !== "string") {
			return { type: "failure", message: `${path}.tasks[${index}] must be a string.` };
		}

		const task = rawTask.trim();
		if (task.length === 0) {
			return { type: "failure", message: `${path}.tasks[${index}] must be non-empty.` };
		}
		tasks.push(task);
	}

	return {
		type: "success",
		value: buildNormalizedPlanPhase({
			title: title.value,
			prompt: prompt.value,
			tasks,
			notes: [],
			validations: [],
		}),
	};
}

function normalizePlanRecipeMetadata(metadata: unknown): ValidationResult<PlanRecipeMetadata> {
	const record = expectPlainRecord(metadata, "planRecipe metadata");
	if (record.type === "failure") return record;

	const keys = validateObjectKeys(record.value, ["title", "summary"], "planRecipe metadata");
	if (keys.type === "failure") return keys;

	const title = normalizeOptionalStringField(record.value, "title", "planRecipe metadata.title");
	if (title.type === "failure") return title;

	const summary = normalizeOptionalStringField(record.value, "summary", "planRecipe metadata.summary");
	if (summary.type === "failure") return summary;

	return { type: "success", value: buildPlanRecipeMetadata(title.value, summary.value) };
}

function expectPlainRecord(value: unknown, path: string): ValidationResult<Record<string, unknown>> {
	if (!isPlainRecord(value)) {
		return { type: "failure", message: `${path} must be a JSON-like plain object.` };
	}

	return { type: "success", value };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function validateObjectKeys(record: Record<string, unknown>, allowedKeys: readonly string[], path: string): ValidationResult<undefined> {
	const allowed = new Set(allowedKeys);
	for (const [key, value] of Object.entries(record)) {
		if (!allowed.has(key)) {
			return { type: "failure", message: `${path}.${key} is not a supported field.` };
		}

		if (value === null) {
			return { type: "failure", message: `${path}.${key} must not be null.` };
		}

		if (typeof value === "function" || typeof value === "symbol") {
			return { type: "failure", message: `${path}.${key} must be JSON-like data.` };
		}
	}

	return { type: "success", value: undefined };
}

function normalizeRequiredStringField(
	record: Record<string, unknown>,
	fieldName: string,
	path: string,
): ValidationResult<string> {
	if (!(fieldName in record)) {
		return { type: "failure", message: `${path} is required.` };
	}

	return normalizeStringValue(record[fieldName], path);
}

function normalizeOptionalStringField(
	record: Record<string, unknown>,
	fieldName: string,
	path: string,
): ValidationResult<string | undefined> {
	if (!(fieldName in record)) {
		return { type: "success", value: undefined };
	}

	const normalized = normalizeStringValue(record[fieldName], path);
	if (normalized.type === "failure") return normalized;
	return normalized;
}

function normalizeStringValue(value: unknown, path: string): ValidationResult<string> {
	if (typeof value !== "string") {
		return { type: "failure", message: `${path} must be a string.` };
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { type: "failure", message: `${path} must be non-empty.` };
	}

	return { type: "success", value: trimmed };
}

function buildNormalizedPlan(input: {
	title?: string | undefined;
	summary?: string | undefined;
	goal: string;
	context?: string | undefined;
	phases: readonly NormalizedPlanPhase[];
	finalItems: readonly NormalizedPlanItem[];
}): NormalizedPlan {
	let plan: NormalizedPlan = {
		goal: input.goal,
		phases: input.phases,
		finalItems: input.finalItems,
	};
	if (input.title !== undefined) plan = { ...plan, title: input.title };
	if (input.summary !== undefined) plan = { ...plan, summary: input.summary };
	if (input.context !== undefined) plan = { ...plan, context: input.context };
	return plan;
}

function buildNormalizedPlanPhase(input: {
	title: string;
	prompt?: string | undefined;
	tasks: readonly string[];
	notes: readonly string[];
	validations: readonly string[];
}): NormalizedPlanPhase {
	const phase: NormalizedPlanPhase = {
		title: input.title,
		tasks: input.tasks,
		notes: input.notes,
		validations: input.validations,
	};
	return input.prompt === undefined ? phase : { ...phase, prompt: input.prompt };
}

function buildPlanRecipeMetadata(title: string | undefined, summary: string | undefined): PlanRecipeMetadata {
	let metadata: PlanRecipeMetadata = {};
	if (title !== undefined) metadata = { ...metadata, title };
	if (summary !== undefined) metadata = { ...metadata, summary };
	return metadata;
}

function normalizeBrandedRecipe(value: unknown): ValidationResult<BrandedRecipe> {
	if (typeof value === "function") {
		return { type: "failure", message: "Raw default-exported functions are not supported. Export default definePlan(...) or planRecipe(...)." };
	}

	if (!hasPlanRecipeBrand(value)) {
		return { type: "failure", message: "Default export must be a branded ts-plans recipe from definePlan(...) or planRecipe(...)." };
	}

	return { type: "success", value };
}

function hasPlanRecipeBrand(value: unknown): value is BrandedRecipe {
	if (!isPlainRecord(value)) return false;
	const branded = value as { readonly [PLAN_RECIPE_BRAND]?: unknown; readonly kind?: unknown };
	return branded[PLAN_RECIPE_BRAND] === true && (branded.kind === "declarative" || branded.kind === "imperative");
}

function isAbortSignalAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

async function evaluateRecipe(recipe: BrandedRecipe, options: RenderRecipeOptions): Promise<ValidationResult<NormalizedPlan>> {
	if (recipe.kind === "declarative") {
		return { type: "success", value: recipe.plan };
	}

	return evaluateImperativeRecipe(recipe, options);
}

async function evaluateImperativeRecipe(recipe: ImperativeRecipe, options: RenderRecipeOptions): Promise<ValidationResult<NormalizedPlan>> {
	if (isAbortSignalAborted(options.signal)) {
		return { type: "failure", message: "Preview aborted." };
	}

	const mutablePlan: MutablePlan = {
		...recipe.metadata,
		goal: "",
		phases: [],
		finalItems: [],
	};
	const pendingPhases: Promise<void>[] = [];
	const runtime = createPlanRecipeRuntime(mutablePlan, pendingPhases, options);

	try {
		await recipe.run(runtime);
		await Promise.all(pendingPhases);
	} catch (error) {
		return { type: "failure", message: errorToMessage(error) };
	}

	if (isAbortSignalAborted(options.signal)) {
		return { type: "failure", message: "Preview aborted." };
	}

	return { type: "success", value: mutablePlan };
}

function createPlanRecipeRuntime(
	plan: MutablePlan,
	pendingPhases: Promise<void>[],
	options: RenderRecipeOptions,
): PlanRecipeRuntime {
	const activePhases: MutablePlanPhase[] = [];

	async function runPhaseBody(phase: MutablePlanPhase, body: PlanRecipePhaseBody): Promise<void> {
		checkAbort(options.signal);
		activePhases.push(phase);
		try {
			await body();
			checkAbort(options.signal);
		} finally {
			activePhases.pop();
		}
	}

	function recordImperativeItem(item: NormalizedPlanItem): void {
		const phase = activePhases.at(-1);
		if (phase === undefined) {
			plan.finalItems.push(item);
			return;
		}

		if (item.type === "task") {
			phase.tasks.push(item.prompt);
			return;
		}
		if (item.type === "note") {
			phase.notes.push(item.text);
			return;
		}
		phase.validations.push(item.command);
	}

	return {
		cwd: options.cwd,
		signal: options.signal,
		goal(text) {
			checkAbort(options.signal);
			plan.goal = normalizeImperativeString(text, "goal");
		},
		context(text) {
			checkAbort(options.signal);
			plan.context = normalizeImperativeString(text, "context");
		},
		phase(title, body) {
			checkAbort(options.signal);
			const phaseTitle = normalizeImperativeString(title, "phase title");
			const phase: MutablePlanPhase = { title: phaseTitle, tasks: [], notes: [], validations: [] };
			plan.phases.push(phase);
			const phasePromise = runPhaseBody(phase, body);
			pendingPhases.push(phasePromise);
			return phasePromise;
		},
		task(prompt) {
			checkAbort(options.signal);
			recordImperativeItem({ type: "task", prompt: normalizeImperativeString(prompt, "task prompt") });
		},
		note(text) {
			checkAbort(options.signal);
			recordImperativeItem({ type: "note", text: normalizeImperativeString(text, "note") });
		},
		validateWithShell(command) {
			checkAbort(options.signal);
			recordImperativeItem({ type: "validation", command: normalizeImperativeString(command, "validation command") });
		},
	};
}

function checkAbort(signal: AbortSignal | undefined): void {
	if (isAbortSignalAborted(signal)) {
		throw new Error("Preview aborted.");
	}
}

function normalizeImperativeString(value: unknown, label: string): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string.`);
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		throw new Error(`${label} must be non-empty.`);
	}

	return trimmed;
}

function renderNormalizedPlan(plan: NormalizedPlan, format: TsPlanRecipePreviewFormat): RenderedRecipe {
	const content = format === "mermaid" ? renderMermaidPlan(plan) : renderTextPlan(plan);
	let rendered: RenderedRecipe = { content };
	if (plan.title !== undefined) rendered = { ...rendered, title: plan.title };
	if (plan.summary !== undefined) rendered = { ...rendered, summary: plan.summary };
	return rendered;
}

function renderTextPlan(plan: NormalizedPlan): string {
	const lines: string[] = [];
	if (plan.title !== undefined) {
		lines.push(`# ${plan.title}`, "");
	}
	if (plan.summary !== undefined) {
		lines.push(`Summary: ${plan.summary}`, "");
	}

	lines.push("Goal:", plan.goal.length > 0 ? plan.goal : "(not specified)");
	if (plan.context !== undefined) {
		lines.push("", "Context:", plan.context);
	}

	if (plan.phases.length > 0) {
		lines.push("", "Phases:");
		for (const [phaseIndex, phase] of plan.phases.entries()) {
			lines.push(`${phaseIndex + 1}. ${phase.title}`);
			if (phase.prompt !== undefined) {
				lines.push(`   Prompt: ${phase.prompt}`);
			}
			for (const task of phase.tasks) {
				lines.push(`   - Task: ${task}`);
			}
			for (const note of phase.notes) {
				lines.push(`   - Note: ${note}`);
			}
			for (const validation of phase.validations) {
				lines.push(`   - Validation: ${validation}`);
			}
		}
	}

	if (plan.finalItems.length > 0) {
		lines.push("", "Final items:");
		for (const item of plan.finalItems) {
			if (item.type === "task") {
				lines.push(`- Task: ${item.prompt}`);
			} else if (item.type === "note") {
				lines.push(`- Note: ${item.text}`);
			} else {
				lines.push(`- Validation: ${item.command}`);
			}
		}
	}

	return lines.join("\n");
}

function renderMermaidPlan(plan: NormalizedPlan): string {
	const lines = ["flowchart TD"];
	const goalLabel = plan.title !== undefined ? `${plan.title}\n${plan.goal}` : plan.goal;
	lines.push(`  goal["${escapeMermaidLabel(goalLabel.length > 0 ? goalLabel : "Plan recipe")}"]`);

	let previousNode = "goal";
	for (const [phaseIndex, phase] of plan.phases.entries()) {
		const phaseNode = `phase${phaseIndex + 1}`;
		lines.push(`  ${previousNode} --> ${phaseNode}["${escapeMermaidLabel(phase.title)}"]`);
		previousNode = phaseNode;

		for (const [taskIndex, task] of phase.tasks.entries()) {
			const taskNode = `${phaseNode}_task${taskIndex + 1}`;
			lines.push(`  ${phaseNode} --> ${taskNode}["${escapeMermaidLabel(task)}"]`);
		}
		for (const [noteIndex, note] of phase.notes.entries()) {
			const noteNode = `${phaseNode}_note${noteIndex + 1}`;
			lines.push(`  ${phaseNode} --> ${noteNode}["${escapeMermaidLabel(`Note: ${note}`)}"]`);
		}
		for (const [validationIndex, validation] of phase.validations.entries()) {
			const validationNode = `${phaseNode}_validation${validationIndex + 1}`;
			lines.push(`  ${phaseNode} --> ${validationNode}["${escapeMermaidLabel(`Validation: ${validation}`)}"]`);
		}
	}

	for (const [itemIndex, item] of plan.finalItems.entries()) {
		const itemNode = `final${itemIndex + 1}`;
		lines.push(`  ${previousNode} --> ${itemNode}["${escapeMermaidLabel(finalItemLabel(item))}"]`);
		previousNode = itemNode;
	}

	return lines.join("\n");
}

function finalItemLabel(item: NormalizedPlanItem): string {
	if (item.type === "task") return `Task: ${item.prompt}`;
	if (item.type === "note") return `Note: ${item.text}`;
	return `Validation: ${item.command}`;
}

function escapeMermaidLabel(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll("\n", " ").replaceAll("\"", "\\\"").replaceAll("[", "(").replaceAll("]", ")");
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown ts-plans recipe error.";
}
