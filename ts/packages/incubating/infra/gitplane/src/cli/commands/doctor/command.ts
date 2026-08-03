import { cliOption, defineCommand, failure, negative, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import { doctorCheckSchema, evaluateDoctor } from "../../../core/index.ts";
import type { DoctorCheck, MaterializationStoreGateway } from "../../../core/index.ts";
import type { GitplaneCliContext } from "../../context.ts";

const requestSchema = z
	.object({
		config: cliOption(z.string().optional(), {
			short: "-c",
			description: "Configuration path relative to the invocation directory.",
		}),
	})
	.strict();
const resultSchema = z
	.object({
		sourceId: z.string(),
		passCount: z.number().int().nonnegative(),
		failCount: z.number().int().nonnegative(),
		unsupportedCount: z.number().int().nonnegative(),
		checks: z.array(doctorCheckSchema),
	})
	.strict();
type DoctorResult = z.infer<typeof resultSchema>;

function result(sourceId: string, checks: readonly DoctorCheck[]): DoctorResult {
	return {
		sourceId,
		passCount: checks.filter((item) => item.status === "pass").length,
		failCount: checks.filter((item) => item.status === "fail").length,
		unsupportedCount: checks.filter((item) => item.status === "unsupported").length,
		checks: [...checks],
	};
}
function renderHuman(value: DoctorResult): string {
	return [
		`${value.sourceId}: ${value.passCount} passed, ${value.failCount} failed, ${value.unsupportedCount} unsupported`,
		...value.checks.map((item) => `${item.status} ${item.code} ${item.subject}: ${item.summary}`),
	].join("\n");
}

export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: requestSchema,
		resultSchema,
		handler: async (context: GitplaneCliContext, request: z.infer<typeof requestSchema>) => {
			const loaded = await context.configGateway.load({
				cwd: context.cwd,
				...(request.config === undefined ? {} : { configPath: request.config }),
			});
			if (!loaded.ok)
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: loaded.category,
					diagnostic: loaded.diagnostic,
					...(loaded.path === undefined ? {} : { path: loaded.path }),
				});
			let store: MaterializationStoreGateway;
			try {
				store = loaded.config.store(
					{ clock: context.clock, configDirectory: loaded.configDirectory },
					{ access: "read-only" },
				);
			} catch {
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "store-open-failed",
					diagnostic: "The configured store could not be opened.",
				});
			}
			let checks: readonly DoctorCheck[] | undefined;
			let inspectionFailed = false;
			try {
				const inspected = await store.inspectDoctor({
					sourceId: loaded.config.source.id,
					targets: (loaded.config.kinds ?? []).map((kind) => kind.target),
				});
				if (inspected.ok)
					checks = evaluateDoctor({
						sourceId: loaded.config.source.id,
						kinds: loaded.config.kinds ?? [],
						introspection: inspected.value,
					});
				else inspectionFailed = true;
			} catch {
				inspectionFailed = true;
			}
			let closeFailed = false;
			try {
				closeFailed = !(await store.close()).ok;
			} catch {
				closeFailed = true;
			}
			if (inspectionFailed)
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "store-inspection-failed",
					diagnostic: "The configured store could not be inspected.",
				});
			if (closeFailed)
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "store-close-failed",
					diagnostic: "The configured store could not be closed.",
				});
			if (checks === undefined) throw new Error("Doctor inspection completed without checks.");
			const data = result(loaded.config.source.id, checks);
			return data.failCount > 0 ? negative("Gitplane storage checks failed.", { data }) : ok(data);
		},
		renderHuman,
	});
}
