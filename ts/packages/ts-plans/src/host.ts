import { mkdtemp, mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderTsPlanRecipe, type TsPlanRecipePreviewFormat } from "./recipe.ts";

export type { TsPlanRecipePreviewFormat } from "./recipe.ts";

export interface PreviewTsPlanRecipeOptions {
	key: string;
	cwd: string;
	format?: TsPlanRecipePreviewFormat;
	signal?: AbortSignal | undefined;
}

export type PreviewTsPlanRecipeResult =
	| { type: "success"; preview: TsPlanRecipePreview }
	| { type: "failure"; message: string };

export interface TsPlanRecipePreview {
	format: TsPlanRecipePreviewFormat;
	content: string;
	title?: string;
	summary?: string;
	trustNotice: string;
}

export interface RenderTsPlanRecipeImplementationInstructionsOptions {
	key: string;
	cwd: string;
	signal?: AbortSignal | undefined;
}

export type RenderTsPlanRecipeImplementationInstructionsResult =
	| { type: "success"; instructions: string; title?: string; summary?: string; trustNotice: string }
	| { type: "failure"; message: string };

export const TS_PLAN_RECIPE_TRUST_NOTICE =
	"Trust boundary: this preview evaluated a local .plan.ts file as trusted TypeScript code with local system permissions. The preview command records and renders plan instructions; it does not execute recorded validation commands, create branches, write Branch Memory, or send an implementation prompt.";

interface LoadedRecipeModule {
	defaultExport: unknown;
	hasMetadataExport: boolean;
}

interface TempRecipeFile {
	filePath: string;
	directoryPath: string;
	parentDirectoryPath: string;
}

export async function previewTsPlanRecipeFromContent(
	content: string,
	options: PreviewTsPlanRecipeOptions,
): Promise<PreviewTsPlanRecipeResult> {
	const format = options.format ?? "text";
	const rendered = await renderRecipeContent(content, { ...options, format });
	if (rendered.type === "failure") {
		return rendered;
	}

	return {
		type: "success",
		preview: buildPreview(format, rendered.rendered.content, rendered.rendered.title, rendered.rendered.summary),
	};
}

export async function renderTsPlanRecipeImplementationInstructionsFromContent(
	content: string,
	options: RenderTsPlanRecipeImplementationInstructionsOptions,
): Promise<RenderTsPlanRecipeImplementationInstructionsResult> {
	const rendered = await renderRecipeContent(content, { ...options, format: "text" });
	if (rendered.type === "failure") {
		return rendered;
	}

	const success = {
		type: "success" as const,
		instructions: rendered.rendered.content,
		trustNotice: TS_PLAN_RECIPE_TRUST_NOTICE,
	};
	return addOptionalTitleAndSummary(success, rendered.rendered.title, rendered.rendered.summary);
}

async function renderRecipeContent(
	content: string,
	options: RequiredPreviewOptions,
): Promise<{ type: "success"; rendered: { content: string; title?: string; summary?: string } } | { type: "failure"; message: string }> {
	if (options.signal?.aborted === true) {
		return { type: "failure", message: "Preview aborted." };
	}

	const loaded = await loadRecipeModuleFromContent(content, options);
	if (loaded.type === "failure") {
		return loaded;
	}

	if (loaded.module.hasMetadataExport) {
		return { type: "failure", message: "Named metadata exports are not supported. Export default definePlan(...) or planRecipe(...)." };
	}

	if (loaded.module.defaultExport === undefined) {
		return { type: "failure", message: "Recipe module must have a default export from definePlan(...) or planRecipe(...)." };
	}

	return renderTsPlanRecipe(loaded.module.defaultExport, options);
}

interface RequiredPreviewOptions {
	key: string;
	cwd: string;
	format: TsPlanRecipePreviewFormat;
	signal?: AbortSignal | undefined;
}

async function loadRecipeModuleFromContent(
	content: string,
	options: RequiredPreviewOptions,
): Promise<{ type: "success"; module: LoadedRecipeModule } | { type: "failure"; message: string }> {
	const tempRecipe = await createTempRecipeFile(content, options.key);
	try {
		if (options.signal?.aborted === true) {
			return { type: "failure", message: "Preview aborted." };
		}

		const moduleUrl = pathToFileURL(tempRecipe.filePath).href;
		const moduleNamespace: unknown = await import(`${moduleUrl}?tsPlanRecipe=${encodeURIComponent(options.key)}`);
		if (!isModuleRecord(moduleNamespace)) {
			return { type: "failure", message: "Recipe module did not evaluate to a module namespace." };
		}

		return {
			type: "success",
			module: {
				defaultExport: moduleNamespace.default,
				hasMetadataExport: "metadata" in moduleNamespace,
			},
		};
	} catch (error) {
		return { type: "failure", message: errorToMessage(error) };
	} finally {
		await rm(tempRecipe.directoryPath, { recursive: true, force: true });
		await removeEmptyTempParent(tempRecipe.parentDirectoryPath);
	}
}

async function createTempRecipeFile(content: string, key: string): Promise<TempRecipeFile> {
	const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
	const tempParent = join(packageRoot, ".ts-plan-preview-tmp");
	await mkdir(tempParent, { recursive: true });
	const sanitizedKey = key.replaceAll(/[^A-Za-z0-9_.-]/g, "-").slice(0, 80);
	const safeKey = sanitizedKey.length > 0 ? sanitizedKey : "recipe";
	const directoryPath = await mkdtemp(join(tempParent, `${safeKey}-`));
	const filePath = join(directoryPath, "recipe.plan.ts");
	await writeFile(filePath, content);
	return { filePath, directoryPath, parentDirectoryPath: tempParent };
}

async function removeEmptyTempParent(tempParent: string): Promise<void> {
	try {
		await rmdir(tempParent);
	} catch (error) {
		if (isExpectedTempParentCleanupError(error)) return;
		throw error;
	}
}

function isExpectedTempParentCleanupError(error: unknown): boolean {
	if (!(error instanceof Error) || !("code" in error)) return false;
	return error.code === "ENOENT" || error.code === "ENOTEMPTY";
}

function buildPreview(
	format: TsPlanRecipePreviewFormat,
	content: string,
	title: string | undefined,
	summary: string | undefined,
): TsPlanRecipePreview {
	const preview = { format, content, trustNotice: TS_PLAN_RECIPE_TRUST_NOTICE };
	return addOptionalTitleAndSummary(preview, title, summary);
}

function addOptionalTitleAndSummary<T extends object>(value: T, title: string | undefined, summary: string | undefined): T & { title?: string; summary?: string } {
	const withTitle = title === undefined ? value : { ...value, title };
	return summary === undefined ? withTitle : { ...withTitle, summary };
}

function isModuleRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown ts-plans recipe load error.";
}
