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

export function makeSubscriberCommand(): Command {
  const subscriber = new Command("subscriber").description("View subscribers");

  subscriber
    .command("list <product-id>")
    .description("List subscribers for a product")
    .option("--email <email>", "Filter by email")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const subscribers = await client.listSubscribers(productId, opts.email);

      console.log(
        formatOutput(
          subscribers.map((s) => ({
            ...s,
            display_date: formatDate(s.created_at),
          })),
          [
            { key: "id", label: "ID", width: 14 },
            { key: "user_email", label: "Email", width: 28 },
            { key: "status", label: "Status", width: 12 },
            { key: "recurrence", label: "Recurrence", width: 12 },
            { key: "display_date", label: "Since", width: 12 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  subscriber
    .command("view <subscriber-id>")
    .description("View subscriber details")
    .option("--json [fields]", "Output as JSON")
    .action(async (subscriberId: string, opts) => {
      const client = resolveClient();
      const s = await client.getSubscriber(subscriberId);

      console.log(
        formatSingle(
          s as unknown as Record<string, unknown>,
          [
            { key: "id", label: "ID" },
            { key: "product_name", label: "Product" },
            { key: "user_email", label: "Email" },
            { key: "status", label: "Status" },
            { key: "recurrence", label: "Recurrence" },
            { key: "created_at", label: "Since" },
            { key: "cancelled_at", label: "Cancelled" },
            { key: "ended_at", label: "Ended" },
            { key: "license_key", label: "License" },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  return subscriber;
}
