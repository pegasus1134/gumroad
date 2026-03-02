import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, formatSingle, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";
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

export function makeOfferCommand(): Command {
  const offer = new Command("offer").description("Manage offer codes");

  offer
    .command("list <product-id>")
    .description("List offer codes for a product")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const offers = await client.listOfferCodes(productId);

      console.log(
        formatOutput(
          offers.map((o) => ({
            ...o,
            discount: o.percent_off != null ? `${o.percent_off}%` : o.amount_off != null ? `$${(o.amount_off / 100).toFixed(2)}` : "—",
          })),
          [
            { key: "id", label: "ID", width: 14 },
            { key: "name", label: "Code", width: 20 },
            { key: "discount", label: "Discount", width: 12 },
            { key: "times_used", label: "Used", width: 8 },
            { key: "universal", label: "Universal", width: 10 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  offer
    .command("view <product-id> <offer-id>")
    .description("View offer code details")
    .option("--json [fields]", "Output as JSON")
    .action(async (productId: string, offerId: string, opts) => {
      const client = resolveClient();
      const o = await client.getOfferCode(productId, offerId);

      console.log(
        formatSingle(
          {
            ...o,
            discount: o.percent_off != null ? `${o.percent_off}%` : o.amount_off != null ? `$${(o.amount_off / 100).toFixed(2)}` : "—",
          } as unknown as Record<string, unknown>,
          [
            { key: "id", label: "ID" },
            { key: "name", label: "Code" },
            { key: "discount", label: "Discount" },
            { key: "offer_type", label: "Type" },
            { key: "max_purchase_count", label: "Max uses" },
            { key: "universal", label: "Universal" },
            { key: "times_used", label: "Times used" },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  offer
    .command("create <product-id>")
    .description("Create an offer code")
    .requiredOption("-n, --name <code>", "Offer code name")
    .requiredOption("-a, --amount <amount>", "Amount off", parseInt)
    .option("-t, --type <type>", "cents or percent", "cents")
    .option("--max <count>", "Maximum redemptions", parseInt)
    .option("--universal", "Apply to all products")
    .option("--json [fields]", "Output as JSON")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const o = await client.createOfferCode(productId, {
        name: opts.name,
        amount_off: opts.amount,
        offer_type: opts.type as "cents" | "percent",
        max_purchase_count: opts.max,
        universal: opts.universal,
      });

      console.log(green(`Created offer "${o.name}" (${o.id})`));
    });

  offer
    .command("update <product-id> <offer-id>")
    .description("Update an offer code")
    .option("--max <count>", "Maximum redemptions", parseInt)
    .action(async (productId: string, offerId: string, opts: { max?: number }) => {
      const client = resolveClient();
      const o = await client.updateOfferCode(productId, offerId, {
        max_purchase_count: opts.max,
      });
      console.log(green(`Updated offer "${o.name}"`));
    });

  offer
    .command("delete <product-id> <offer-id>")
    .description("Delete an offer code")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, offerId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Delete offer code ${offerId}?`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteOfferCode(productId, offerId);
      console.log(red(`Deleted offer ${offerId}`));
    });

  return offer;
}
