import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, formatSingle, formatPrice, type FormatOptions } from "../output/format.js";
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

export function makeProductCommand(): Command {
  const product = new Command("product").description("Manage products");

  product
    .command("list")
    .description("List all products")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (opts) => {
      const client = resolveClient();
      const products = await client.listProducts();

      console.log(
        formatOutput(
          products.map((p) => ({
            ...p,
            display_price: formatPrice(p.price),
            status: p.published ? "published" : "draft",
          })),
          [
            { key: "id", label: "ID", width: 24 },
            { key: "name", label: "Name", width: 30 },
            { key: "display_price", label: "Price", width: 10 },
            { key: "sales_count", label: "Sales", width: 8 },
            { key: "status", label: "Status", width: 12 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  product
    .command("view <product-id>")
    .description("View product details")
    .option("--json [fields]", "Output as JSON")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const p = await client.getProduct(productId);

      console.log(
        formatSingle(
          { ...p, display_price: formatPrice(p.price), revenue: formatPrice(p.sales_usd_cents) } as unknown as Record<string, unknown>,
          [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "description", label: "Description" },
            { key: "display_price", label: "Price" },
            { key: "published", label: "Published" },
            { key: "sales_count", label: "Sales" },
            { key: "revenue", label: "Revenue" },
            { key: "short_url", label: "URL" },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  product
    .command("enable <product-id>")
    .description("Publish a product")
    .action(async (productId: string) => {
      const client = resolveClient();
      const p = await client.enableProduct(productId);
      console.log(green(`Enabled "${p.name}"`));
    });

  product
    .command("disable <product-id>")
    .description("Unpublish a product")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(yellow(`Disable product ${productId}?`));
        if (!ok) return;
      }
      const client = resolveClient();
      const p = await client.disableProduct(productId);
      console.log(yellow(`Disabled "${p.name}"`));
    });

  product
    .command("delete <product-id>")
    .description("Permanently delete a product")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Permanently delete product ${productId}? This cannot be undone.`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteProduct(productId);
      console.log(red(`Deleted product ${productId}`));
    });

  return product;
}
