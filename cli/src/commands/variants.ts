import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatOutput, type FormatOptions } from "../output/format.js";
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

export function makeVariantCommand(): Command {
  const variant = new Command("variant").description("Manage product variants");

  variant
    .command("list <product-id>")
    .description("List variant categories and variants")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show IDs")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const categories = await client.listVariantCategories(productId);

      const rows = categories.flatMap((cat) =>
        cat.variants.map((v) => ({
          category_id: cat.id,
          category: cat.title,
          id: v.id,
          name: v.name,
          price_diff: v.price_difference_cents
            ? `${v.price_difference_cents > 0 ? "+" : ""}$${(v.price_difference_cents / 100).toFixed(2)}`
            : "—",
          max: v.max_purchase_count ?? "—",
        })),
      );

      console.log(
        formatOutput(
          rows as unknown as Record<string, unknown>[],
          [
            { key: "category", label: "Category", width: 16 },
            { key: "id", label: "Variant ID", width: 14 },
            { key: "name", label: "Name", width: 20 },
            { key: "price_diff", label: "Price Diff", width: 12 },
            { key: "max", label: "Max", width: 8 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  variant
    .command("create <product-id> <category-id>")
    .description("Create a variant in a category")
    .requiredOption("-n, --name <name>", "Variant name")
    .option("--price-diff <cents>", "Price difference in cents", parseInt)
    .option("--max <count>", "Maximum purchase count", parseInt)
    .action(async (productId: string, categoryId: string, opts) => {
      const client = resolveClient();
      const v = await client.createVariant(productId, categoryId, {
        name: opts.name,
        price_difference_cents: opts.priceDiff,
        max_purchase_count: opts.max,
      });
      console.log(green(`Created variant "${v.name}" (${v.id})`));
    });

  variant
    .command("update <product-id> <category-id> <variant-id>")
    .description("Update a variant")
    .option("-n, --name <name>", "New name")
    .option("--price-diff <cents>", "Price difference in cents", parseInt)
    .option("--max <count>", "Maximum purchase count", parseInt)
    .action(async (productId: string, categoryId: string, variantId: string, opts) => {
      const client = resolveClient();
      const v = await client.updateVariant(productId, categoryId, variantId, {
        name: opts.name,
        price_difference_cents: opts.priceDiff,
        max_purchase_count: opts.max,
      });
      console.log(green(`Updated variant "${v.name}"`));
    });

  variant
    .command("delete <product-id> <category-id> <variant-id>")
    .description("Delete a variant")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, categoryId: string, variantId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Delete variant ${variantId}?`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteVariant(productId, categoryId, variantId);
      console.log(red(`Deleted variant ${variantId}`));
    });

  const category = new Command("category").description("Manage variant categories");

  category
    .command("create <product-id>")
    .description("Create a variant category")
    .requiredOption("-t, --title <title>", "Category title")
    .action(async (productId: string, opts: { title: string }) => {
      const client = resolveClient();
      const c = await client.createVariantCategory(productId, opts.title);
      console.log(green(`Created category "${c.title}" (${c.id})`));
    });

  category
    .command("update <product-id> <category-id>")
    .description("Update a variant category")
    .requiredOption("-t, --title <title>", "New title")
    .action(async (productId: string, categoryId: string, opts: { title: string }) => {
      const client = resolveClient();
      const c = await client.updateVariantCategory(productId, categoryId, opts.title);
      console.log(green(`Updated category "${c.title}"`));
    });

  category
    .command("delete <product-id> <category-id>")
    .description("Delete a variant category")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, categoryId: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Delete category ${categoryId} and all its variants?`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteVariantCategory(productId, categoryId);
      console.log(red(`Deleted category ${categoryId}`));
    });

  variant.addCommand(category);

  return variant;
}
