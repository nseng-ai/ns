import {
	TS_PLAN_RECIPE_TRUST_NOTICE,
	inspectTsPlanRecipeFromContent,
	previewTsPlanRecipeFromContent,
} from "@asdl/ts-plans/host";

import { appHtml } from "./static-app.ts";
import {
	listSavedTsPlans,
	readSavedTsPlanSource,
	type PlanStoreFailureCode,
	type TsPlanViewerOptions,
} from "./plan-store.ts";

// Public JSON wire envelopes intentionally use the conventional `success` flag.
export interface ApiSuccess<T> {
	success: true;
	data: T;
}

export interface ApiFailure {
	success: false;
	error: {
		code: string;
		message: string;
	};
}

export type TsPlanViewerRequestHandler = (request: Request) => Response | Promise<Response>;

const previewFormats = ["structured", "text", "mermaid"] as const;
type PreviewFormat = (typeof previewFormats)[number];

export function createTsPlanViewerRequestHandler(options: TsPlanViewerOptions): TsPlanViewerRequestHandler {
	return async function handleTsPlanViewerRequest(request: Request): Promise<Response> {
		try {
			const url = new URL(request.url);
			if (url.pathname.startsWith("/api/")) {
				return await handleApiRequest(request, url, options);
			}

			if (request.method !== "GET" && request.method !== "HEAD") {
				return jsonFailure(405, "method-not-allowed", "Only GET requests are supported.");
			}

			return new Response(appHtml(), {
				status: 200,
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		} catch (error) {
			return jsonFailure(500, "server-error", errorToMessage(error));
		}
	};
}

async function handleApiRequest(request: Request, url: URL, options: TsPlanViewerOptions): Promise<Response> {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return jsonFailure(405, "method-not-allowed", "Only GET requests are supported.");
	}

	const parts = url.pathname.split("/").filter((part) => part.length > 0);
	if (parts.length === 2 && parts[0] === "api" && parts[1] === "health") {
		// Health endpoint wire contract intentionally uses the conventional `ok` field.
		return jsonSuccess({ ok: true, planStoreRoot: options.planStoreRoot, cwd: options.cwd, trustNotice: TS_PLAN_RECIPE_TRUST_NOTICE });
	}

	if (parts.length === 2 && parts[0] === "api" && parts[1] === "plans") {
		const plans = await listSavedTsPlans(options.planStoreRoot);
		return jsonSuccess({ plans });
	}

	if (parts.length === 4 && parts[0] === "api" && parts[1] === "plans" && parts[3] === "source") {
		return await handleSourceRequest(parts[2], options);
	}

	if (parts.length === 4 && parts[0] === "api" && parts[1] === "plans" && parts[3] === "preview") {
		return await handlePreviewRequest(parts[2], url, options);
	}

	return jsonFailure(404, "not-found", "API route not found.");
}

async function handleSourceRequest(id: string | undefined, options: TsPlanViewerOptions): Promise<Response> {
	if (id === undefined) {
		return jsonFailure(400, "invalid-id", "Missing saved plan id.");
	}

	const source = await readSavedTsPlanSource(options.planStoreRoot, id);
	if (source.type === "failure") {
		return jsonFailure(statusForPlanStoreFailure(source.code), source.code, source.message);
	}

	return jsonSuccess({ source: source.source, filePath: source.filePath });
}

async function handlePreviewRequest(id: string | undefined, url: URL, options: TsPlanViewerOptions): Promise<Response> {
	if (id === undefined) {
		return jsonFailure(400, "invalid-id", "Missing saved plan id.");
	}

	const format = normalizePreviewFormat(url.searchParams.get("format") ?? "structured");
	if (format.type === "failure") {
		return jsonFailure(400, "unsupported-format", format.message);
	}

	const source = await readSavedTsPlanSource(options.planStoreRoot, id);
	if (source.type === "failure") {
		return jsonFailure(statusForPlanStoreFailure(source.code), source.code, source.message);
	}

	if (format.value === "structured") {
		const inspected = await inspectTsPlanRecipeFromContent(source.source, { key: source.filePath, cwd: options.cwd });
		if (inspected.type === "failure") {
			return jsonFailure(422, "recipe-evaluation-failed", inspected.message);
		}
		return jsonSuccess({ model: inspected.model, trustNotice: inspected.trustNotice });
	}

	const preview = await previewTsPlanRecipeFromContent(source.source, { key: source.filePath, cwd: options.cwd, format: format.value });
	if (preview.type === "failure") {
		return jsonFailure(422, "recipe-evaluation-failed", preview.message);
	}

	return jsonSuccess({ preview: preview.preview });
}

function normalizePreviewFormat(value: string): { type: "success"; value: PreviewFormat } | { type: "failure"; message: string } {
	if (previewFormats.includes(value as PreviewFormat)) {
		return { type: "success", value: value as PreviewFormat };
	}
	return { type: "failure", message: "Preview format must be structured, text, or mermaid." };
}

function statusForPlanStoreFailure(code: PlanStoreFailureCode): number {
	if (code === "invalid-id") return 400;
	if (code === "not-found") return 404;
	return 500;
}

function jsonSuccess<T>(data: T): Response {
	const body: ApiSuccess<T> = { success: true, data };
	return jsonResponse(body, 200);
}

function jsonFailure(status: number, code: string, message: string): Response {
	const body: ApiFailure = { success: false, error: { code, message } };
	return jsonResponse(body, status);
}

function jsonResponse(body: ApiSuccess<unknown> | ApiFailure, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
}

function errorToMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown ts-plan-viewer server error.";
}
