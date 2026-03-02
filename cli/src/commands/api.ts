import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";

export function makeApiCommand(): Command {
  const api = new Command("api")
    .description("Make raw API requests (like gh api)")
    .argument("<endpoint>", "API endpoint (e.g. /v2/products)")
    .option("-X, --method <method>", "HTTP method", "GET")
    .option("-f, --field <key=value...>", "Request body fields", collect, [])
    .option("--paginate", "Auto-paginate and collect all results")
    .option("--jq <expr>", "Filter JSON output with jq expression")
    .action(
      async (
        endpoint: string,
        opts: {
          method: string;
          field: string[];
          paginate?: boolean;
          jq?: string;
        },
      ) => {
        const token = getToken();
        if (!token) throw new AuthenticationError();

        const path = endpoint.startsWith("/v2")
          ? endpoint.slice(3)
          : endpoint.startsWith("/")
            ? endpoint
            : `/${endpoint}`;

        const client = new GumroadClient({ token });

        const body: Record<string, string> = {};
        for (const f of opts.field) {
          const eq = f.indexOf("=");
          if (eq > 0) {
            body[f.slice(0, eq)] = f.slice(eq + 1);
          }
        }

        const method = opts.method.toUpperCase() as
          | "GET"
          | "POST"
          | "PUT"
          | "DELETE";

        if (opts.paginate) {
          const dataKey = guessDataKey(path);
          const items = await client.paginateAll(path, dataKey, {
            method,
            body: Object.keys(body).length > 0 ? body : undefined,
          });
          outputJson(items, opts.jq);
          return;
        }

        const result = await client.request(path, {
          method,
          body: Object.keys(body).length > 0 ? body : undefined,
        });

        outputJson(result, opts.jq);
      },
    );

  return api;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

function guessDataKey(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1];

  const keyMap: Record<string, string> = {
    products: "products",
    sales: "sales",
    subscribers: "subscribers",
    payouts: "payouts",
    offer_codes: "offer_codes",
    variant_categories: "variant_categories",
    variants: "variants",
    custom_fields: "custom_fields",
    resource_subscriptions: "resource_subscriptions",
  };

  return keyMap[last] || last;
}

function outputJson(data: unknown, jq?: string): void {
  if (jq && Array.isArray(data)) {
    const trimmed = jq.trim();
    const arrayAccessMatch = trimmed.match(/^\.\[\]\.(\w+)$/);
    if (arrayAccessMatch) {
      const key = arrayAccessMatch[1];
      const result = (data as Record<string, unknown>[]).map((item) => item[key]);
      console.log(JSON.stringify(result, null, 2));
      return;
    }
  }
  console.log(JSON.stringify(data, null, 2));
}
