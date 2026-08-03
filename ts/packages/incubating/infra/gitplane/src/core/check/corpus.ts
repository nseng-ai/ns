import type { ArtifactCorpus } from "../domain.ts";
import type { Finding } from "./finding.ts";
export interface CorpusCheckFailure {
	readonly code: string;
	readonly message: string;
}
export type CorpusPreconditionResult =
	| {
			readonly type: "ready";
			readonly corpus: ArtifactCorpus;
			readonly findings: readonly Finding[];
	  }
	| {
			readonly type: "invalid";
			readonly artifactCount: number;
			readonly findings: readonly Finding[];
	  }
	| { readonly type: "failed"; readonly failure: CorpusCheckFailure };
export type CorpusCheckResult = CorpusPreconditionResult;
