import type { GatewayResult, ErrorInfo } from "@nseng-ai/capability-kit/gateway-result";
import { err, ok } from "@nseng-ai/capability-kit/gateway-result";
import type { MaybePromise } from "@nseng-ai/foundation/primitives";

export type ParentBranchWalkStep<T> =
	| { readonly type: "visit"; readonly parentBranch: string | undefined; readonly item: T }
	| { readonly type: "stop" };

export async function walkParentBranchChain<T>(input: {
	readonly startBranch: string;
	readonly stopBranch?: string;
	readonly cycleError: (branch: string) => ErrorInfo;
	readonly readStep: (branch: string) => MaybePromise<GatewayResult<ParentBranchWalkStep<T>>>;
}): Promise<GatewayResult<T[]>> {
	const items: T[] = [];
	const visited = new Set<string>();
	let branch: string | undefined = input.startBranch;
	while (branch !== undefined && branch !== input.stopBranch) {
		if (visited.has(branch)) return err(input.cycleError(branch));
		visited.add(branch);

		const step = await input.readStep(branch);
		if (!step.ok) return step;
		if (step.value.type === "stop") break;

		items.push(step.value.item);
		branch = step.value.parentBranch;
	}
	return ok(items);
}
