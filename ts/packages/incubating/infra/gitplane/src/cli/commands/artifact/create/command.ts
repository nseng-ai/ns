import {
	cliOption,
	cliPositional,
	defineCommand,
	failure,
	negative,
	ok,
	usageError,
} from "@nseng-ai/clinkr/app";
import { z } from "zod";
import {
	parseArtifactId,
	serializeArtifactMarker,
	type ArtifactClassification,
} from "../../../../core/index.ts";
import type { GitplaneCliContext } from "../../../context.ts";
const requestSchema = z
	.object({
		directory: cliPositional(z.string().min(1), {
			position: 0,
			description: "New artifact directory.",
		}),
		id: cliOption(z.string().optional(), {
			short: "-i",
			description: "Canonical lowercase ULID.",
		}),
		kind: cliOption(z.string().optional(), {
			short: "-k",
			description: "Classify with this kind.",
		}),
		apiVersion: cliOption(z.string().optional(), {
			short: "-a",
			description: "Classification API version (requires --kind).",
		}),
		schemaVersion: cliOption(z.coerce.number().int().optional(), {
			short: "-s",
			description: "Classification schema version (requires --kind).",
		}),
	})
	.strict();
const resultSchema = z.object({ directory: z.string(), artifactId: z.string() });
async function handleArtifactCreate(
	context: GitplaneCliContext,
	request: z.infer<typeof requestSchema>,
) {
	if (
		request.kind === undefined &&
		(request.apiVersion !== undefined || request.schemaVersion !== undefined)
	)
		return usageError("--api-version and --schema-version require --kind.", {
			argument: request.apiVersion !== undefined ? "--api-version" : "--schema-version",
		});
	if (request.kind !== undefined && request.kind.length === 0)
		return usageError("--kind must be non-empty.", { argument: "--kind" });
	if (request.apiVersion !== undefined && request.apiVersion.length === 0)
		return usageError("--api-version must be non-empty.", { argument: "--api-version" });
	if (request.schemaVersion !== undefined && request.schemaVersion <= 0)
		return usageError("--schema-version must be a positive integer.", {
			argument: "--schema-version",
		});
	const id =
		request.id === undefined
			? { ok: true as const, artifactId: context.artifactIds.generateArtifactId() }
			: parseArtifactId(request.id);
	if (!id.ok) return usageError(id.message, { argument: "--id", code: id.code });
	const classification: ArtifactClassification =
		request.kind === undefined
			? { state: "generic" }
			: {
					state: "classified",
					apiVersion: request.apiVersion ?? "gitplane/v0",
					kind: request.kind,
					schemaVersion: request.schemaVersion ?? 1,
				};
	const result = await context.artifactGateway.createArtifact({
		directory: request.directory,
		artifactId: id.artifactId,
		marker: serializeArtifactMarker({ artifactId: id.artifactId, classification }),
	});
	if (result.type === "target-exists")
		return negative(`Target already exists: ${request.directory}`, {
			data: { code: "target-exists", directory: request.directory },
		});
	if (result.type === "parent-missing")
		return negative(`Immediate parent does not exist: ${request.directory}`, {
			data: { code: "parent-missing", directory: request.directory },
		});
	if (result.type === "error")
		return failure("artifact-create-failed", result.error.message, {
			code: result.error.code,
			directory: request.directory,
		});
	return ok({ directory: result.directory, artifactId: result.artifactId });
}
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: requestSchema,
		resultSchema,
		handler: handleArtifactCreate,
		renderHuman: (result) => `Created ${result.directory} (${result.artifactId})`,
	});
}
