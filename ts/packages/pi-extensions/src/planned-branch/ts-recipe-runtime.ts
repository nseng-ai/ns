import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { LoadedAttachedPlan } from "@asdl/planned-branch";
import { isRecord } from "../cmux/primitives.ts";

export interface TsPlanRecipeMetadata {
	title?: string;
	summary?: string;
}

export type TsPlanRecipe = (runtime: TsPlanRecipeRuntime) => Promise<void> | void;

export interface LoadedTsPlanRecipe {
	metadata: TsPlanRecipeMetadata;
	recipe: TsPlanRecipe;
	key: string;
}

export type TsPlanRecipeEventType = "goal" | "context" | "note" | "phase" | "task" | "inspect" | "do" | "shell" | "acceptance";

export interface TsPlanRecipeEvent {
	type: TsPlanRecipeEventType;
	text: string;
	depth: number;
}

export interface RenderedTsPlanRecipe {
	metadata: TsPlanRecipeMetadata;
	events: readonly TsPlanRecipeEvent[];
	prompt: string;
}

export interface TsPlanRecipeRuntime {
	goal(text: string): void;
	context(text: string): Promise<void> | void;
	note(text: string): Promise<void> | void;
	phase(name: string, body: () => Promise<void> | void): Promise<void>;
	task(name: string, body: () => Promise<void> | void): Promise<void>;
	inspect(instruction: string): Promise<void> | void;
	do(instruction: string): Promise<void> | void;
	shell(command: string): Promise<void> | void;
	acceptance(text: string): Promise<void> | void;
}

class RecordingTsPlanRecipeRuntime implements TsPlanRecipeRuntime {
	private readonly recordedEvents: TsPlanRecipeEvent[] = [];
	private depth = 0;

	get events(): readonly TsPlanRecipeEvent[] {
		return [...this.recordedEvents];
	}

	goal(text: string): void {
		this.record("goal", text);
	}

	context(text: string): void {
		this.record("context", text);
	}

	note(text: string): void {
		this.record("note", text);
	}

	async phase(name: string, body: () => Promise<void> | void): Promise<void> {
		this.record("phase", name);
		await this.withNestedBody(body);
	}

	async task(name: string, body: () => Promise<void> | void): Promise<void> {
		this.record("task", name);
		await this.withNestedBody(body);
	}

	inspect(instruction: string): void {
		this.record("inspect", instruction);
	}

	do(instruction: string): void {
		this.record("do", instruction);
	}

	shell(command: string): void {
		this.record("shell", command);
	}

	acceptance(text: string): void {
		this.record("acceptance", text);
	}

	private async withNestedBody(body: () => Promise<void> | void): Promise<void> {
		this.depth += 1;
		try {
			await body();
		} finally {
			this.depth -= 1;
		}
	}

	private record(type: TsPlanRecipeEventType, text: string): void {
		if (typeof text !== "string" || text.trim().length === 0) {
			throw new Error(`TypeScript planned-branch recipe call ${type} requires non-empty string text.`);
		}
		this.recordedEvents.push({ type, text: text.trim(), depth: this.depth });
	}
}

export async function loadTsPlanRecipeFromContent(content: string, options: { key: string; cwd: string; signal?: AbortSignal | undefined }): Promise<LoadedTsPlanRecipe> {
	if (options.signal?.aborted) {
		throw new Error("TypeScript planned-branch recipe loading was cancelled before import.");
	}
	const tempDir = await mkdtemp(join(tmpdir(), "planned-branch-ts-recipe-"));
	const filePath = join(tempDir, sanitizeTempRecipeFileName(options.key));
	try {
		await writeFile(filePath, content, "utf8");
		const url = `${pathToFileURL(filePath).href}?v=${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const moduleValue: unknown = await import(url);
		return parseRecipeModule(moduleValue, options.key);
	} catch (error) {
		throw new Error(`Failed to load trusted TypeScript planned-branch recipe ${options.key}: ${formatRecipeError(error)}`);
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export async function renderTsPlanRecipe(recipe: LoadedTsPlanRecipe, options: { cwd: string; signal?: AbortSignal | undefined }): Promise<RenderedTsPlanRecipe> {
	if (options.signal?.aborted) {
		throw new Error("TypeScript planned-branch recipe rendering was cancelled before evaluation.");
	}
	const runtime = new RecordingTsPlanRecipeRuntime();
	try {
		await recipe.recipe(runtime);
	} catch (error) {
		throw new Error(`Failed to evaluate trusted TypeScript planned-branch recipe ${recipe.key}: ${formatRecipeError(error)}`);
	}
	const events = runtime.events;
	return {
		metadata: recipe.metadata,
		events,
		prompt: renderRecipeEventsPrompt(recipe.metadata, events),
	};
}

export async function buildImplTsPlannedBranchPrompt(plan: LoadedAttachedPlan, options: { cwd: string; signal?: AbortSignal | undefined }): Promise<string> {
	const recipe = await loadTsPlanRecipeFromContent(plan.content, { key: plan.selectedKey, cwd: options.cwd, signal: options.signal });
	const rendered = await renderTsPlanRecipe(recipe, options);
	return [
		"# planned-branch TypeScript recipe implementation",
		"",
		"The attached planned-branch TypeScript recipe has been loaded and evaluated by Pi into these implementation instructions.",
		"Treat the `.plan.ts` source as the source of truth. If the rendered prompt and source conflict, inspect the source and ask before proceeding.",
		"",
		"## Loaded recipe source",
		"",
		`Branch: ${plan.branch}`,
		`Namespace: ${plan.namespace}`,
		`Selected key: ${plan.selectedKey}`,
		`Ref: ${plan.refName}`,
		`Bytes: ${plan.byteCount}`,
		`Source: ${plan.source}`,
		plan.sourceFile === undefined ? undefined : `Source file: ${plan.sourceFile}`,
		"",
		"## Rendered recipe instructions",
		"",
		rendered.prompt,
	].filter((line): line is string => line !== undefined).join("\n");
}

function parseRecipeModule(moduleValue: unknown, key: string): LoadedTsPlanRecipe {
	if (!isRecord(moduleValue)) {
		throw new Error("recipe module did not evaluate to an object.");
	}
	const defaultExport = moduleValue.default;
	if (typeof defaultExport !== "function") {
		throw new Error("recipe module must default-export a function like `export default async function plan(pi) { ... }`.");
	}
	const metadata = parseRecipeMetadata(moduleValue.metadata);
	return { metadata, recipe: defaultExport as TsPlanRecipe, key };
}

function parseRecipeMetadata(value: unknown): TsPlanRecipeMetadata {
	if (value === undefined) {
		return {};
	}
	if (!isRecord(value)) {
		throw new Error("optional recipe metadata export must be an object.");
	}
	const metadata: TsPlanRecipeMetadata = {};
	if (value.title !== undefined) {
		if (typeof value.title !== "string") {
			throw new Error("optional recipe metadata.title must be a string.");
		}
		metadata.title = value.title;
	}
	if (value.summary !== undefined) {
		if (typeof value.summary !== "string") {
			throw new Error("optional recipe metadata.summary must be a string.");
		}
		metadata.summary = value.summary;
	}
	return metadata;
}

function renderRecipeEventsPrompt(metadata: TsPlanRecipeMetadata, events: readonly TsPlanRecipeEvent[]): string {
	const lines: string[] = [];
	if (metadata.title !== undefined) {
		lines.push(`Title: ${metadata.title}`);
	}
	if (metadata.summary !== undefined) {
		lines.push(`Summary: ${metadata.summary}`);
	}
	if (lines.length > 0) {
		lines.push("");
	}
	if (events.length === 0) {
		lines.push("The recipe recorded no implementation instructions. Ask for clarification before editing code.");
		return lines.join("\n");
	}
	for (const event of events) {
		lines.push(formatRecipeEvent(event));
	}
	return lines.join("\n");
}

function formatRecipeEvent(event: TsPlanRecipeEvent): string {
	const indent = "  ".repeat(event.depth);
	switch (event.type) {
		case "goal":
			return `${indent}## Goal\n${indent}${event.text}`;
		case "context":
			return `${indent}### Context\n${indent}${event.text}`;
		case "note":
			return `${indent}- Note: ${event.text}`;
		case "phase":
			return `${indent}## Phase: ${event.text}`;
		case "task":
			return `${indent}### Task: ${event.text}`;
		case "inspect":
			return `${indent}- Inspect: ${event.text}`;
		case "do":
			return `${indent}- Do: ${event.text}`;
		case "shell":
			return `${indent}- Validate with shell: ${event.text}`;
		case "acceptance":
			return `${indent}- Acceptance: ${event.text}`;
	}
}

function sanitizeTempRecipeFileName(key: string): string {
	const sanitized = key.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
	if (sanitized.endsWith(".plan.ts")) {
		return sanitized;
	}
	return `${sanitized || "recipe"}.plan.ts`;
}

function formatRecipeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
