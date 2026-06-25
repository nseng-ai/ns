export type SessionUserMessageDelivery = "steer" | "followUp" | "nextTurn";

export interface SessionUserMessageOptions {
	deliverAs?: SessionUserMessageDelivery;
}

export interface SessionReplacementResult {
	/** External Pi session-switch contract; Pi documents this field as `cancelled`. */
	cancelled: boolean;
}

export interface SessionReplacementContext {
	sendUserMessage(content: string, options?: SessionUserMessageOptions): Promise<void> | void;
}

export interface SessionReplacementOptions<
	TContext extends SessionReplacementContext = SessionReplacementContext,
	TManager = unknown,
> {
	parentSession?: string;
	setup?(sessionManager: TManager): Promise<void> | void;
	withSession?(ctx: TContext): Promise<void> | void;
}
