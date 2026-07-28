import type { Clock } from "@nseng-ai/ns-foundation/clock";
import { NodeCommandExecApi, runCommand } from "@nseng-ai/ns-foundation/exec";
import { RealGitGateway } from "@nseng-ai/ns-foundation/git";
import { systemClock, systemTimerScheduler } from "@nseng-ai/ns-foundation/time";
import type { TimerScheduler } from "@nseng-ai/ns-foundation/timers";
import { RealGithubPrFeedbackGateway } from "@nseng-ai/extension-kit/github/pr-feedback";
import type { PrAddressGithubGateway, PrAddressGitGateway } from "./api.ts";

export interface PrAddressContext {
	git: PrAddressGitGateway;
	prFeedback: PrAddressGithubGateway;
	clock: Clock;
	timers: TimerScheduler;
}

export function createRealPrAddressContext(): PrAddressContext {
	return {
		git: new RealGitGateway(new NodeCommandExecApi()),
		prFeedback: new RealGithubPrFeedbackGateway(runCommand),
		clock: systemClock,
		timers: systemTimerScheduler,
	};
}
