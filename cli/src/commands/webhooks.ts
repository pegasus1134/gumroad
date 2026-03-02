import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError, RESOURCE_NAMES, type ResourceName } from "../api/types.js";
import { green, red } from "../output/colors.js";
import { confirm } from "../output/format.js";

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

export function makeWebhookCommand(): Command {
  const webhook = new Command("webhook").description("Manage webhooks (resource subscriptions)");

  webhook
    .command("list")
    .description("List all webhooks")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (opts) => {
      const client = resolveClient();
      const subs = await client.listResourceSubscriptions();

      console.log(
        formatOutput(
          subs as unknown as Record<string, unknown>[],
          [
            { key: "id", label: "ID", width: 14 },
            { key: "resource_name", label: "Event", width: 24 },
            { key: "post_url", label: "URL", width: 40 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  webhook
    .command("create")
    .description("Create a webhook subscription")
    .requiredOption("-e, --event <name>", `Event name (${RESOURCE_NAMES.join(", ")})`)
    .requiredOption("-u, --url <url>", "POST URL for webhook delivery")
    .action(async (opts: { event: string; url: string }) => {
      if (!RESOURCE_NAMES.includes(opts.event as ResourceName)) {
        console.error(red(`Invalid event: "${opts.event}"`));
        console.error(`Valid events: ${RESOURCE_NAMES.join(", ")}`);
        process.exitCode = 1;
        return;
      }
      const client = resolveClient();
      const sub = await client.createResourceSubscription(
        opts.event as ResourceName,
        opts.url,
      );
      console.log(green(`Created webhook ${sub.id} for "${sub.resource_name}"`));
    });

  webhook
    .command("delete <subscription-id>")
    .description("Delete a webhook subscription")
    .option("-y, --yes", "Skip confirmation")
    .action(async (subscriptionId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Delete webhook ${subscriptionId}?`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteResourceSubscription(subscriptionId);
      console.log(red(`Deleted webhook ${subscriptionId}`));
    });

  return webhook;
}
