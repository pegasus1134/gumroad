import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, formatSingle, formatPrice, formatDate, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";
import { green, red, yellow } from "../output/colors.js";
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

export function makeSaleCommand(): Command {
  const sale = new Command("sale").description("Manage sales");

  sale
    .command("list")
    .description("List sales")
    .option("--after <date>", "Sales after this date (YYYY-MM-DD)")
    .option("--before <date>", "Sales before this date (YYYY-MM-DD)")
    .option("--product <id>", "Filter by product ID")
    .option("--email <email>", "Filter by buyer email")
    .option("--limit <n>", "Maximum number of results", parseInt)
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (opts) => {
      const client = resolveClient();
      const sales = await client.listSales({
        after: opts.after,
        before: opts.before,
        productId: opts.product,
        email: opts.email,
        limit: opts.limit,
      });

      console.log(
        formatOutput(
          sales.map((s) => ({
            ...s,
            display_price: s.formatted_display_price || formatPrice(s.price),
            display_date: formatDate(s.created_at),
            status: s.refunded ? "refunded" : s.chargebacked ? "chargebacked" : "paid",
          })),
          [
            { key: "id", label: "ID", width: 14 },
            { key: "product_name", label: "Product", width: 24 },
            { key: "email", label: "Email", width: 28 },
            { key: "display_price", label: "Price", width: 10 },
            { key: "status", label: "Status", width: 12 },
            { key: "display_date", label: "Date", width: 12 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  sale
    .command("view <sale-id>")
    .description("View sale details")
    .option("--json [fields]", "Output as JSON")
    .action(async (saleId: string, opts) => {
      const client = resolveClient();
      const s = await client.getSale(saleId);

      console.log(
        formatSingle(
          {
            ...s,
            display_price: s.formatted_display_price || formatPrice(s.price),
            status: s.refunded ? "refunded" : s.chargebacked ? "chargebacked" : "paid",
          } as unknown as Record<string, unknown>,
          [
            { key: "id", label: "ID" },
            { key: "product_name", label: "Product" },
            { key: "email", label: "Email" },
            { key: "display_price", label: "Price" },
            { key: "status", label: "Status" },
            { key: "quantity", label: "Quantity" },
            { key: "created_at", label: "Date" },
            { key: "order_id", label: "Order" },
            { key: "license_key", label: "License" },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  sale
    .command("ship <sale-id>")
    .description("Mark a sale as shipped")
    .option("--tracking-url <url>", "Tracking URL")
    .action(async (saleId: string, opts: { trackingUrl?: string }) => {
      const client = resolveClient();
      const s = await client.markSaleAsShipped(saleId, opts.trackingUrl);
      console.log(green(`Marked sale ${s.id} as shipped`));
    });

  sale
    .command("refund <sale-id>")
    .description("Refund a sale")
    .option("--amount <cents>", "Partial refund amount in cents", parseInt)
    .option("-y, --yes", "Skip confirmation")
    .action(async (saleId: string, opts: { amount?: number; yes?: boolean }) => {
      if (!opts.yes) {
        const msg = opts.amount
          ? yellow(`Refund ${formatPrice(opts.amount)} for sale ${saleId}?`)
          : red(`Fully refund sale ${saleId}?`);
        const ok = await confirm(msg);
        if (!ok) return;
      }
      const client = resolveClient();
      const s = await client.refundSale(saleId, opts.amount);
      console.log(green(`Refunded sale ${s.id}`));
    });

  return sale;
}
