import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatSingle, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";
import { green, yellow } from "../output/colors.js";

function resolveClient(): GumroadClient {
  const token = getToken();
  if (!token) throw new AuthenticationError();
  return new GumroadClient({ token });
}

export function makeLicenseCommand(): Command {
  const license = new Command("license").description("Manage license keys");

  license
    .command("verify <product-id> <license-key>")
    .description("Verify a license key")
    .option("--json [fields]", "Output as JSON")
    .action(async (productId: string, licenseKey: string, opts: { json?: boolean | string }) => {
      const client = resolveClient();
      const result = await client.verifyLicense(productId, licenseKey);

      const formatOpts: FormatOptions = {};
      if (opts.json !== undefined) {
        formatOpts.json =
          typeof opts.json === "string"
            ? opts.json.split(",").map((s) => s.trim())
            : true;
      }

      console.log(
        formatSingle(
          {
            success: result.success,
            uses: result.uses,
            email: result.purchase.email,
            product: result.purchase.product_name,
            created_at: result.purchase.created_at,
          } as unknown as Record<string, unknown>,
          [
            { key: "success", label: "Valid" },
            { key: "uses", label: "Uses" },
            { key: "email", label: "Email" },
            { key: "product", label: "Product" },
            { key: "created_at", label: "Purchased" },
          ],
          formatOpts,
        ),
      );
    });

  license
    .command("enable <product-id> <license-key>")
    .description("Enable a license key")
    .action(async (productId: string, licenseKey: string) => {
      const client = resolveClient();
      await client.enableLicense(productId, licenseKey);
      console.log(green("License enabled"));
    });

  license
    .command("disable <product-id> <license-key>")
    .description("Disable a license key")
    .action(async (productId: string, licenseKey: string) => {
      const client = resolveClient();
      await client.disableLicense(productId, licenseKey);
      console.log(yellow("License disabled"));
    });

  license
    .command("decrement <product-id> <license-key>")
    .description("Decrement a license key's use count")
    .action(async (productId: string, licenseKey: string) => {
      const client = resolveClient();
      const result = await client.decrementLicense(productId, licenseKey);
      console.log(green(`License uses decremented (now: ${result.uses})`));
    });

  return license;
}
