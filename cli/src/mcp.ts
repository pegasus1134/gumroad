#!/usr/bin/env node

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GumroadClient } from "./api/client.js";
import { getToken } from "./config/auth.js";
import { tools } from "./tools/index.js";
import { formatPrice } from "./output/format.js";

const server = new McpServer({
  name: "gumroad",
  version: "0.1.2",
});

function getClient(): GumroadClient {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated. Run: gumroad auth login");
  }
  return new GumroadClient({ token });
}

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema,
    async (args: Record<string, unknown>) => {
      try {
        const client = getClient();
        const result = await tool.handler(args, client);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

server.resource("gumroad://user", "Current authenticated Gumroad user profile", async (uri) => {
  const client = getClient();
  const user = await client.getUser();
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(user, null, 2),
      },
    ],
  };
});

server.resource(
  "gumroad://products",
  "All products in the Gumroad store",
  async (uri) => {
    const client = getClient();
    const products = await client.listProducts();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(products, null, 2),
        },
      ],
    };
  },
);

server.resource(
  "gumroad://payouts/upcoming",
  "Upcoming payout information",
  async (uri) => {
    const client = getClient();
    const payouts = await client.listPayouts();
    const upcoming = payouts.filter((p) => !p.is_completed);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(upcoming, null, 2),
        },
      ],
    };
  },
);

server.prompt(
  "sales-report",
  "Generate a sales report for a given date range",
  {
    start_date: z.string().describe("Start date (YYYY-MM-DD)"),
    end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
  },
  async (args) => {
    const client = getClient();
    const sales = await client.listSales({
      after: args.start_date,
      before: args.end_date || undefined,
      limit: 200,
    });

    const valid = sales.filter((s) => !s.refunded && !s.chargebacked);
    const revenue = valid.reduce((sum, s) => sum + s.price, 0);

    const byProduct = new Map<string, { count: number; revenue: number }>();
    for (const s of valid) {
      const existing = byProduct.get(s.product_name) || { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += s.price;
      byProduct.set(s.product_name, existing);
    }

    const breakdown = Array.from(byProduct.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, data]) => `- ${name}: ${data.count} sales, ${formatPrice(data.revenue)}`)
      .join("\n");

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate a sales report for the period ${args.start_date} to ${args.end_date || "now"}.\n\nData:\n- Total sales: ${sales.length}\n- Valid (non-refunded) sales: ${valid.length}\n- Refunded: ${sales.length - valid.length}\n- Total revenue: ${formatPrice(revenue)}\n\nBreakdown by product:\n${breakdown}`,
          },
        },
      ],
    };
  },
);

server.prompt(
  "product-analysis",
  "Analyze the performance of a specific product",
  {
    product_id: z.string().describe("Product ID to analyze"),
  },
  async (args) => {
    const client = getClient();
    const [product, sales] = await Promise.all([
      client.getProduct(args.product_id),
      client.listSales({ productId: args.product_id, limit: 100 }),
    ]);

    const valid = sales.filter((s) => !s.refunded && !s.chargebacked);
    const refundRate = sales.length > 0
      ? ((sales.filter((s) => s.refunded).length / sales.length) * 100).toFixed(1)
      : "0";

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Analyze the performance of "${product.name}".\n\nProduct details:\n- Price: ${formatPrice(product.price)}\n- Published: ${product.published}\n- Total sales: ${product.sales_count}\n- Lifetime revenue: ${formatPrice(product.sales_usd_cents)}\n- URL: ${product.short_url}\n\nRecent sales data (last ${sales.length} sales):\n- Valid sales: ${valid.length}\n- Refund rate: ${refundRate}%\n- Variants: ${product.variants?.length || 0} categories\n- Custom fields: ${product.custom_fields?.length || 0}\n\nProvide insights on performance, pricing strategy, and actionable recommendations.`,
          },
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("MCP server error:", error);
  process.exit(1);
});
