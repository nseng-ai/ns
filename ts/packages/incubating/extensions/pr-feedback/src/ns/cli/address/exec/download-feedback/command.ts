import { downloadFeedbackOperation } from "../../../../../download-feedback.ts";
import { prAddressOperationNsCommand } from "../../../../command.ts";

export async function command() {
	return prAddressOperationNsCommand(downloadFeedbackOperation);
}
