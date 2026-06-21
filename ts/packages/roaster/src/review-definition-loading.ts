import type { RoasterFailure, RoasterResult } from "./failures.ts";
import type { ReviewCatalogGateway, ReviewSource } from "./gateways/review-catalog.ts";
import type { ReviewDefinition } from "./models.ts";
import { parseReviewDefinition } from "./review-definition.ts";

export interface LoadParsedReviewDefinitionOptions {
	readonly reviewCatalog: ReviewCatalogGateway;
	readonly cwd: string;
	readonly key: string;
	readonly signal?: AbortSignal | undefined;
}

export interface ParsedReviewDefinition {
	readonly source: ReviewSource;
	readonly definition: ReviewDefinition;
}

export async function loadParsedReviewDefinition(
	options: LoadParsedReviewDefinitionOptions,
): Promise<RoasterResult<ParsedReviewDefinition>> {
	const source = await options.reviewCatalog.loadReviewSource({
		cwd: options.cwd,
		key: options.key,
		...(options.signal === undefined ? {} : { signal: options.signal }),
	});
	if (source.type === "error") return source;

	const parsed = parseReviewDefinition(source.value.source, { name: source.value.key });
	if (parsed.type === "error") {
		return {
			type: "error",
			error: reviewDefinitionInvalidFailure(source.value, parsed.error.message),
		};
	}

	return {
		type: "ok",
		value: {
			source: source.value,
			definition: parsed.definition,
		},
	};
}

export function reviewDefinitionInvalidFailure(
	source: ReviewSource,
	message: string,
): RoasterFailure {
	return {
		type: "review_definition_invalid",
		message: `Review definition ${source.key} at ${source.path} is invalid: ${message}`,
	};
}
