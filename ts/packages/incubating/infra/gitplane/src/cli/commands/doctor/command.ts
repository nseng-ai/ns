import { cliOption, defineCommand, failure, negative, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import { doctorCheckSchema, evaluateDoctor } from "../../../core/index.ts";
import type {
	DoctorCheck,
	DoctorIntrospection,
	MaterializationStoreGateway,
} from "../../../core/index.ts";
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
			let loaded: ConfigLoadResult;
			try {
				loaded = await context.configGateway.load({
					cwd: context.cwd,
					...(request.config === undefined ? {} : { configPath: request.config }),
				});
			} catch {
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "config-load",
					diagnostic: "Unexpected configuration load failure.",
				});
			}
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
			const kinds = loaded.config.kinds ?? [];
			let introspection: DoctorIntrospection | undefined;
			let inspectionCauseCode: string | undefined;
			try {
				const inspected = await store.inspectDoctor({
					targets: kinds.map((kind) => kind.target),
				});
				if (inspected.ok) introspection = inspected.value;
				else inspectionCauseCode = inspected.error.code;
			} catch {
				// Unexpected throws are normalized by the failure gate below.
			}
			let closeFailed = false;
			let closeCauseCode: string | undefined;
			try {
				const closed = await store.close();
				if (!closed.ok) {
					closeFailed = true;
					closeCauseCode = closed.error.code;
				}
			} catch {
				closeFailed = true;
			}
			if (introspection === undefined)
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "store-inspection-failed",
					diagnostic: "The configured store could not be inspected.",
					...(inspectionCauseCode === undefined ? {} : { causeCode: inspectionCauseCode }),
				});
			if (closeFailed)
				return failure("doctor-failed", "Unable to inspect Gitplane storage.", {
					category: "store-close-failed",
					diagnostic: "The configured store could not be closed.",
					...(closeCauseCode === undefined ? {} : { causeCode: closeCauseCode }),
				});
			const checks = evaluateDoctor({ sourceId: loaded.config.source.id, kinds, introspection });
			const data = result(loaded.config.source.id, checks);
			return data.failCount > 0 ? negative("Gitplane storage checks failed.", { data }) : ok(data);
		},
		renderHuman,
	});
}
