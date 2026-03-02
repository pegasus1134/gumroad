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

export function makeFieldCommand(): Command {
  const field = new Command("field").description("Manage custom fields");

  field
    .command("list <product-id>")
    .description("List custom fields for a product")
    .option("--json [fields]", "Output as JSON")
    .option("--jq <expr>", "Filter JSON output")
    .option("-q, --quiet", "Only show names")
    .action(async (productId: string, opts) => {
      const client = resolveClient();
      const fields = await client.listCustomFields(productId);

      if (opts.quiet) {
        console.log(fields.map((f) => f.name).join("\n"));
        return;
      }

      console.log(
        formatOutput(
          fields as unknown as Record<string, unknown>[],
          [
            { key: "name", label: "Name", width: 24 },
            { key: "type", label: "Type", width: 12 },
            { key: "required", label: "Required", width: 10 },
          ],
          parseFormatOpts(opts),
        ),
      );
    });

  field
    .command("create <product-id>")
    .description("Create a custom field")
    .requiredOption("-n, --name <name>", "Field name")
    .option("-r, --required", "Field is required")
    .action(async (productId: string, opts: { name: string; required?: boolean }) => {
      const client = resolveClient();
      await client.createCustomField(productId, {
        name: opts.name,
        required: opts.required,
      });
      console.log(green(`Created field "${opts.name}"`));
    });

  field
    .command("update <product-id> <field-name>")
    .description("Update a custom field")
    .option("-n, --name <name>", "New field name")
    .option("-r, --required", "Field is required")
    .option("--no-required", "Field is not required")
    .action(async (productId: string, fieldName: string, opts: { name?: string; required?: boolean }) => {
      const client = resolveClient();
      await client.updateCustomField(productId, fieldName, {
        name: opts.name,
        required: opts.required,
      });
      console.log(green(`Updated field "${fieldName}"`));
    });

  field
    .command("delete <product-id> <field-name>")
    .description("Delete a custom field")
    .option("-y, --yes", "Skip confirmation")
    .action(async (productId: string, fieldName: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await confirm(red(`Delete field "${fieldName}"?`));
        if (!ok) return;
      }
      const client = resolveClient();
      await client.deleteCustomField(productId, fieldName);
      console.log(red(`Deleted field "${fieldName}"`));
    });

  return field;
}
