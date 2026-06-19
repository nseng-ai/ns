/**
 * @asdl/aretro - Branch session retrospective evidence operations.
 *
 * This package provides a TypeScript CLI for collecting and managing
 * privacy-conscious retrospective evidence from branch sessions.
 */

export type { AretroCliContext } from "./context.ts";
export { createRealAretroContext } from "./context.ts";
export type { EvidenceEnvelope } from "./contracts.ts";
export { evidenceEnvelopeSchema } from "./contracts.ts";
export type {
	CollectEvidenceRequest,
	CollectEvidenceResult,
} from "./operations/collect-evidence.ts";
export {
	collectEvidenceRequestSchema,
	collectEvidenceResultSchema,
	renderCollectEvidence,
	runCollectEvidence,
} from "./operations/collect-evidence.ts";
export type {
	ReadEvidenceDetailRequest,
	ReadEvidenceDetailResult,
} from "./operations/read-evidence-detail.ts";
export {
	readEvidenceDetailRequestSchema,
	readEvidenceDetailResultSchema,
	renderReadEvidenceDetail,
	runReadEvidenceDetail,
} from "./operations/read-evidence-detail.ts";
export { buildCli, runCli, VERSION } from "./cli.ts";
