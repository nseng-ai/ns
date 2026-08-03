import { waitForChecksOperation } from "../../../../../wait-for-checks.ts";
import { prAddressOperationNsCommand } from "../../../../command.ts";

export async function command() {
	return prAddressOperationNsCommand(waitForChecksOperation);
}
