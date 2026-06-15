export type UserMessageDelivery = "followUp" | "steer";

export interface SendUserMessageOptions {
	deliverAs?: UserMessageDelivery;
}

export type AgentMessageDelivery = UserMessageDelivery | "nextTurn";

export interface SendMessageOptions {
	triggerTurn?: boolean;
	deliverAs?: AgentMessageDelivery;
}
