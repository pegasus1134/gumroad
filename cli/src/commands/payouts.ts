import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, formatSingle, formatDate, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";

function resolveClient(): GumroadClient {
  const token = getToken();
  if (!token) throw new AuthenticationError();
  return new GumroadClient({ token });
}

function parseFormatOpts(opts: { json?: boolean | string; jq?: string; quiet?: boolean }): FormatOptions {
  const formatOpts: FormatOptions = { jq: opts.jq, quiet: opts.quiet };
  if (opts.json !== undefined) {
    formatOpts.json =
      typeof opts.json === "string"
        ? opts.json.split(",").map((s) => s.trim())
        : true;
  }
  return formatOpts;
}

export function makePayoutCommand(): Command {
  const payout = new Command("payout").description("View payouts");

  payout
    .command("list")
    .description("List all payouts")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (opts) => {
      const client = resolveClient();
      const payouts = await client.listPayouts();

      console.log(
        formatOutput(
          payouts.map((p) => ({
            ...p,
            display_date: formatDate(p.created_at),
            status: p.is_completed ? "completed" : "pending",
          })),
          [
            { key: "id", label: "ID", width: 14 },
            { key: "display_amount", label: "Amount", width: 14 },
            { key: "status", label: "Status", width: 12 },
            { key: "display_date", label: "Date", width: 14 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  payout
    .command("view <payout-id>")
    .description("View payout details")
    .option("--json [fields]", "Output as JSON")
    .action(async (payoutId: string, opts) => {
      const client = resolveClient();
      const p = await client.getPayoutById(payoutId);
      if (!p) {
        console.error(`Payout ${payoutId} not found`);
        process.exitCode = 1;
        return;
      }

      console.log(
        formatSingle(
          { ...p, status: p.is_completed ? "completed" : "pending" } as unknown as Record<string, unknown>,
          [
            { key: "id", label: "ID" },
            { key: "display_amount", label: "Amount" },
            { key: "status", label: "Status" },
            { key: "created_at", label: "Date" },
            { key: "user_id", label: "User" },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  return payout;
}
