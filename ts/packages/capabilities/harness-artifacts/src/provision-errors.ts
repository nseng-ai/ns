import { resultErr, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactFileSystemErrorInfo } from "./filesystem.ts";
import type { ProvisionDecisionErrorInfo, ProvisionPlanErrorInfo } from "./provision-plan.ts";

export type HarnessArtifactProvisionErrorInfo =
	| ProvisionPlanErrorInfo
	| ProvisionDecisionErrorInfo
	| HarnessArtifactFileSystemErrorInfo
	| {
			code: "invalid_install_manifest";
			message: string;
			details: { manifestPath: string };
	  }
	| {
			code: "stale_prepared_reconciliation";
			message: string;
			details: { kind: "source" | "target" | "manifest"; path: string; installKey: string };
	  }
	| {
			code: "unsafe_manifest_entry";
			message: string;
			details: { manifestPath: string; installKey: string; path: string };
	  };

export function stalePreparation(
	kind: "source" | "target" | "manifest",
	path: string,
	installKey: string,
): Result<never, HarnessArtifactProvisionErrorInfo> {
	return resultErr({
		code: "stale_prepared_reconciliation",
		message: `Prepared harness artifact ${installKey} is stale because its ${kind} state changed at ${path}.`,
		details: { kind, path, installKey },
	});
}

export function unsafeManifestEntry(
	manifestPath: string,
	installKey: string,
	path: string,
): Result<never, HarnessArtifactProvisionErrorInfo> {
	return resultErr({
		code: "unsafe_manifest_entry",
		message: `Install manifest entry ${installKey} is not coherent with its harness root: ${path}.`,
		details: { manifestPath, installKey, path },
	});
}
