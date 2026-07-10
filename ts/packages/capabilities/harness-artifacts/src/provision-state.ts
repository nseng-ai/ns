import { resultOk, type Result } from "@nseng-ai/foundation/result";

import type { HarnessArtifactFileSystemGateway } from "./filesystem.ts";
import type { HarnessArtifactProvisionErrorInfo } from "./provision-errors.ts";
import { contentHashForBytes, type TargetFileHashFact } from "./provision-plan.ts";

export async function collectTargetHashFactsForPaths(input: {
	fs: HarnessArtifactFileSystemGateway;
	targetPaths: readonly string[];
}): Promise<Result<readonly TargetFileHashFact[], HarnessArtifactProvisionErrorInfo>> {
	const facts: TargetFileHashFact[] = [];
	for (const targetPath of input.targetPaths) {
		const target = await input.fs.readOptionalFile(targetPath);
		if (!target.ok) return target;
		if (target.value.type === "missing") facts.push({ type: "missing", targetPath });
		else {
			facts.push({
				type: "file",
				targetPath,
				contentHash: contentHashForBytes(target.value.bytes),
			});
		}
	}
	return resultOk(facts);
}

export function targetFactsEqual(left: TargetFileHashFact, right: TargetFileHashFact): boolean {
	return (
		left.type === right.type &&
		(left.type === "missing" || (right.type === "file" && left.contentHash === right.contentHash))
	);
}
