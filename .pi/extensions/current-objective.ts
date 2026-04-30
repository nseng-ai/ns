import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const UI_KEY = "current-objective";

type ObjectiveState =
	| { kind: "objective"; slug: string }
	| { kind: "none" }
	| { kind: "unavailable" };

type StatusBadge =
	| { kind: "objective"; slug: string | null }
	| { kind: "none"; slug: string | null };

type CurrentObjectiveEnvelope = {
	exit_code?: number;
	data?: {
		status_badge?: StatusBadge;
	};
};

export default function currentObjectiveExtension(pi: ExtensionAPI) {
	let refreshSequence = 0;

	async function refresh(ctx: ExtensionContext): Promise<void> {
		if (!ctx.hasUI) return;

		const sequence = ++refreshSequence;
		const state = await loadCurrentObjective(pi, ctx);
		if (sequence !== refreshSequence) return;

		renderObjective(ctx, state);
	}

	pi.on("session_start", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		await refresh(ctx);
	});
}

async function loadCurrentObjective(pi: ExtensionAPI, ctx: ExtensionContext): Promise<ObjectiveState> {
	try {
		const result = await pi.exec("objective", ["exec", "current", "--format", "json"], {
			cwd: ctx.cwd,
			timeout: 5000,
		});

		if (result.code !== 0) return { kind: "unavailable" };

		const parsed = JSON.parse(result.stdout) as CurrentObjectiveEnvelope;
		const statusBadge = parsed.data?.status_badge;
		if (statusBadge?.kind === "objective" && typeof statusBadge.slug === "string") {
			return { kind: "objective", slug: statusBadge.slug };
		}
		if (statusBadge?.kind === "none") {
			return { kind: "none" };
		}

		return { kind: "unavailable" };
	} catch {
		return { kind: "unavailable" };
	}
}

function renderObjective(ctx: ExtensionContext, state: ObjectiveState): void {
	if (state.kind === "objective") {
		ctx.ui.setStatus(UI_KEY, ctx.ui.theme.fg("dim", `obj: ${state.slug}`));
		ctx.ui.setWidget(UI_KEY, [`Objective: ${state.slug}`]);
		return;
	}

	if (state.kind === "none") {
		ctx.ui.setStatus(UI_KEY, undefined);
		ctx.ui.setWidget(UI_KEY, undefined);
		return;
	}

	ctx.ui.setStatus(UI_KEY, ctx.ui.theme.fg("dim", "obj: unavailable"));
	ctx.ui.setWidget(UI_KEY, undefined);
}
