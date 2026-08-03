import { cliOption, defineCommand, failure, negative, ok } from "@nseng-ai/clinkr/app";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { z } from "zod";
import { checkArtifactCorpus, findingSchema, inspectCorpusTopology } from "../../../core/index.ts";
import type { Finding } from "../../../core/index.ts";
import type { ConfigLoadResult } from "../../config-gateway.ts";
import type { GitplaneCliContext } from "../../context.ts";

const requestSchema = z
	.object({
		config: cliOption(z.string().optional(), {
			short: "-c",
			description: "Configuration path relative to the invocation directory.",
		}),
	})
	.strict();
const completedSchema = z
	.object({
		sourceId: z.string(),
		artifactRoot: z.string(),
		artifactCount: z.number().int().nonnegative(),
		errorCount: z.number().int().nonnegative(),
		warningCount: z.number().int().nonnegative(),
		findings: z.array(findingSchema),
	})
	.strict();
type Completed = z.infer<typeof completedSchema>;

function completed(
	sourceId: string,
	artifactRoot: string,
	artifactCount: number,
	findings: readonly Finding[],
): Completed {
	return {
		sourceId,
		artifactRoot,
		artifactCount,
		errorCount: findings.filter((item) => item.severity === "error").length,
		warningCount: findings.filter((item) => item.severity === "warning").length,
		findings: [...findings],
	};
}
function renderFinding(finding: Finding): string {
	const location = [finding.artifactPath, finding.relativePath, finding.jsonPointer]
		.filter((part) => part !== undefined)
		.join(":");
	return `${finding.severity} ${finding.code}${location === "" ? "" : ` ${location}`}: ${finding.summary}`;
}
function renderCompleted(result: Completed): string {
	const header = `${result.sourceId}: ${result.artifactCount} artifacts, ${result.errorCount} errors, ${result.warningCount} warnings`;
	return [header, ...result.findings.map(renderFinding)].join("\n");
}

export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: requestSchema,
		resultSchema: completedSchema,
		handler: async (context: GitplaneCliContext, request: z.infer<typeof requestSchema>) => {
			let loaded: ConfigLoadResult;
			try {
				loaded = await context.configGateway.load({
					cwd: context.cwd,
					...optionalEntries({ configPath: request.config }),
				});
			} catch {
				return failure("check-failed", "Unable to check the artifact corpus.", {
					category: "config-load",
					diagnostic: "Unexpected configuration load failure.",
				});
			}
			if (!loaded.ok)
				return failure("check-failed", "Unable to check the artifact corpus.", {
					category: loaded.category,
					diagnostic: loaded.diagnostic,
					...optionalEntries({ path: loaded.path }),
				});
			try {
				const inventory = await context.artifactGateway.inventoryWorkingTree({
					artifactRoot: loaded.artifactRoot,
				});
				if (!inventory.ok)
					return failure("check-failed", "Unable to check the artifact corpus.", {
						category: "source-read-failed",
						diagnostic: "Unable to inventory the artifact root.",
						path: loaded.artifactRoot,
						causeCode: inventory.error.code,
					});
				const topology = inspectCorpusTopology(inventory.value);
				if (topology.findings.length > 0) {
					const data = completed(
						loaded.config.source.id,
						loaded.artifactRoot,
						topology.artifactCount,
						topology.findings,
					);
					return negative("Artifact corpus is invalid.", { data });
				}
				const candidates = [];
				for (const boundary of topology.boundaries) {
					const candidate = await context.artifactGateway.readWorkingTreeCandidate({
						path: boundary.path,
					});
					if (!candidate.ok)
						return failure("check-failed", "Unable to check the artifact corpus.", {
							category: "source-read-failed",
							diagnostic: "Unable to read an artifact candidate.",
							path: boundary.path,
							causeCode: candidate.error.code,
						});
					candidates.push(candidate.value);
				}
				const result = checkArtifactCorpus({
					sourceId: loaded.config.source.id,
					artifactCount: topology.artifactCount,
					candidates,
					...optionalEntries({ kinds: loaded.config.kinds }),
				});
				if (result.type === "failed")
					return failure("check-failed", "Unable to check the artifact corpus.", {
						category: "source-read-failed",
						diagnostic: "Unable to process an artifact candidate.",
						causeCode: result.failure.code,
					});
				const data = completed(
					loaded.config.source.id,
					loaded.artifactRoot,
					topology.artifactCount,
					result.findings,
				);
				return result.type === "invalid"
					? negative("Artifact corpus is invalid.", { data })
					: ok(data);
			} catch {
				return failure("check-failed", "Unable to check the artifact corpus.", {
					category: "source-read-failed",
					diagnostic: "Unexpected source read failure.",
				});
			}
		},
		renderHuman: renderCompleted,
	});
}
