import { z } from "zod";
import { GumroadClient } from "../api/client.js";
import { formatPrice } from "../output/format.js";
import type { GumroadSale } from "../api/types.js";
import { RESOURCE_NAMES } from "../api/types.js";

type ZodRawShape = Record<string, z.ZodTypeAny>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: Record<string, unknown>, client: GumroadClient) => Promise<unknown>;
}

export const tools: ToolDefinition[] = [
  {
    name: "gumroad_business_overview",
    description:
      "Get a complete business overview: user profile, all products with stats, recent sales, and upcoming payouts in a single call. Use this first to understand the seller's Gumroad business.",
    inputSchema: {},
    handler: async (_args, client) => {
      const [user, products, recentSales] = await Promise.all([
        client.getUser(),
        client.listProducts(),
        client.listSales({ limit: 20 }),
      ]);

      const publishedProducts = products.filter((p) => p.published);
      const totalRevenue = products.reduce((sum, p) => sum + p.sales_usd_cents, 0);

      return {
        user: {
          name: user.name,
          email: user.email,
          profile_url: user.profile_url,
        },
        summary: {
          total_products: products.length,
          published_products: publishedProducts.length,
          total_revenue: formatPrice(totalRevenue),
          total_revenue_cents: totalRevenue,
        },
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          price: formatPrice(p.price),
          sales_count: p.sales_count,
          revenue: formatPrice(p.sales_usd_cents),
          published: p.published,
          url: p.short_url,
        })),
        recent_sales: recentSales.slice(0, 10).map((s) => ({
          id: s.id,
          product: s.product_name,
          email: s.email,
          price: s.formatted_display_price,
          date: s.created_at,
          refunded: s.refunded,
        })),
      };
    },
  },

  {
    name: "gumroad_get_user",
    description: "Get the authenticated Gumroad user's profile information.",
    inputSchema: {},
    handler: async (_args, client) => client.getUser(),
  },

  {
    name: "gumroad_list_products",
    description: "List all products in the Gumroad store with stats.",
    inputSchema: {},
    handler: async (_args, client) => client.listProducts(),
  },

  {
    name: "gumroad_get_product",
    description:
      "Get detailed information about a specific product, including variants, offer codes, and custom fields.",
    inputSchema: {
      product_id: z.string().describe("The product ID"),
    },
    handler: async (args, client) => {
      const productId = args.product_id as string;
      const [product, offerCodes, variantCategories, customFields] =
        await Promise.all([
          client.getProduct(productId),
          client.listOfferCodes(productId).catch(() => []),
          client.listVariantCategories(productId).catch(() => []),
          client.listCustomFields(productId).catch(() => []),
        ]);

      return {
        ...product,
        offer_codes: offerCodes,
        variant_categories: variantCategories,
        custom_fields: customFields,
      };
    },
  },

  {
    name: "gumroad_search_products",
    description: "Search and filter products by name, price range, or publication status.",
    inputSchema: {
      query: z.string().optional().describe("Search products by name (case-insensitive)"),
      published: z.boolean().optional().describe("Filter by published status"),
      min_price_cents: z.number().optional().describe("Minimum price in cents"),
      max_price_cents: z.number().optional().describe("Maximum price in cents"),
    },
    handler: async (args, client) => {
      let products = await client.listProducts();

      if (args.query) {
        const q = (args.query as string).toLowerCase();
        products = products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q)),
        );
      }
      if (args.published !== undefined) {
        products = products.filter((p) => p.published === args.published);
      }
      if (args.min_price_cents !== undefined) {
        products = products.filter((p) => p.price >= (args.min_price_cents as number));
      }
      if (args.max_price_cents !== undefined) {
        products = products.filter((p) => p.price <= (args.max_price_cents as number));
      }

      return products;
    },
  },

  {
    name: "gumroad_list_sales",
    description: "List sales with optional date and product filters.",
    inputSchema: {
      after: z.string().optional().describe("Sales after this date (YYYY-MM-DD)"),
      before: z.string().optional().describe("Sales before this date (YYYY-MM-DD)"),
      product_id: z.string().optional().describe("Filter by product ID"),
      email: z.string().optional().describe("Filter by buyer email"),
      limit: z.number().optional().default(50).describe("Maximum number of results"),
    },
    handler: async (args, client) => {
      return client.listSales({
        after: args.after as string | undefined,
        before: args.before as string | undefined,
        productId: args.product_id as string | undefined,
        email: args.email as string | undefined,
        limit: (args.limit as number) || 50,
      });
    },
  },

  {
    name: "gumroad_get_sale",
    description: "Get detailed information about a specific sale.",
    inputSchema: {
      sale_id: z.string().describe("The sale ID"),
    },
    handler: async (args, client) => client.getSale(args.sale_id as string),
  },

  {
    name: "gumroad_revenue_summary",
    description:
      "Get aggregated revenue summary for today, this week, and this month. Excludes refunded and chargebacked sales for accurate numbers.",
    inputSchema: {},
    handler: async (_args, client) => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const sales = await client.listSales({
        after: monthStart.toISOString().split("T")[0],
        limit: 500,
      });

      const valid = sales.filter((s) => !s.refunded && !s.chargebacked);

      const sum = (items: GumroadSale[]) =>
        items.reduce((total, s) => total + s.price, 0);

      const todaySales = valid.filter((s) => new Date(s.created_at) >= todayStart);
      const weekSales = valid.filter((s) => new Date(s.created_at) >= weekStart);

      return {
        today: {
          sales_count: todaySales.length,
          revenue: formatPrice(sum(todaySales)),
          revenue_cents: sum(todaySales),
        },
        this_week: {
          sales_count: weekSales.length,
          revenue: formatPrice(sum(weekSales)),
          revenue_cents: sum(weekSales),
        },
        this_month: {
          sales_count: valid.length,
          revenue: formatPrice(sum(valid)),
          revenue_cents: sum(valid),
        },
      };
    },
  },

  {
    name: "gumroad_toggle_product",
    description: "Enable or disable (publish/unpublish) a product.",
    inputSchema: {
      product_id: z.string().describe("The product ID"),
      enabled: z.boolean().describe("true to publish, false to unpublish"),
    },
    handler: async (args, client) => {
      const productId = args.product_id as string;
      if (args.enabled) {
        return client.enableProduct(productId);
      }
      return client.disableProduct(productId);
    },
  },

  {
    name: "gumroad_refund_sale",
    description: "Refund a sale. Optionally specify a partial refund amount in cents.",
    inputSchema: {
      sale_id: z.string().describe("The sale ID to refund"),
      amount_cents: z.number().optional().describe("Partial refund amount in cents (omit for full refund)"),
    },
    handler: async (args, client) => {
      return client.refundSale(
        args.sale_id as string,
        args.amount_cents as number | undefined,
      );
    },
  },

  {
    name: "gumroad_ship_sale",
    description: "Mark a sale as shipped, optionally with a tracking URL.",
    inputSchema: {
      sale_id: z.string().describe("The sale ID"),
      tracking_url: z.string().optional().describe("Tracking URL for the shipment"),
    },
    handler: async (args, client) => {
      return client.markSaleAsShipped(
        args.sale_id as string,
        args.tracking_url as string | undefined,
      );
    },
  },

  {
    name: "gumroad_verify_license",
    description: "Verify a license key for a product.",
    inputSchema: {
      product_id: z.string().describe("The product ID"),
      license_key: z.string().describe("The license key to verify"),
    },
    handler: async (args, client) => {
      return client.verifyLicense(
        args.product_id as string,
        args.license_key as string,
      );
    },
  },

  {
    name: "gumroad_list_subscribers",
    description: "List subscribers for a membership/subscription product.",
    inputSchema: {
      product_id: z.string().describe("The product ID"),
      email: z.string().optional().describe("Filter by subscriber email"),
    },
    handler: async (args, client) => {
      return client.listSubscribers(
        args.product_id as string,
        args.email as string | undefined,
      );
    },
  },

  {
    name: "gumroad_list_payouts",
    description: "List all payout history.",
    inputSchema: {},
    handler: async (_args, client) => client.listPayouts(),
  },

  {
    name: "gumroad_create_offer",
    description: "Create a discount/offer code for a product.",
    inputSchema: {
      product_id: z.string().describe("The product ID"),
      name: z.string().describe("The offer code (e.g. SUMMER20)"),
      amount_off: z.number().describe("Amount off (in cents or percent depending on type)"),
      offer_type: z.enum(["cents", "percent"]).default("cents").describe("Discount type"),
      max_purchase_count: z
        .number()
        .optional()
        .describe("Maximum number of times this code can be used"),
      universal: z.boolean().optional().describe("Whether to apply to all products"),
    },
    handler: async (args, client) => {
      return client.createOfferCode(args.product_id as string, {
        name: args.name as string,
        amount_off: args.amount_off as number,
        offer_type: args.offer_type as "cents" | "percent",
        max_purchase_count: args.max_purchase_count as number | undefined,
        universal: args.universal as boolean | undefined,
      });
    },
  },

  {
    name: "gumroad_manage_webhook",
    description:
      "Create or delete webhook subscriptions (resource subscriptions). Events: sale, refund, dispute, dispute_won, cancellation, subscription_updated, subscription_ended, subscription_restarted.",
    inputSchema: {
      action: z.enum(["create", "delete"]).describe("Whether to create or delete"),
      resource_name: z
        .enum(RESOURCE_NAMES as unknown as [string, ...string[]])
        .optional()
        .describe("Event name (required for create)"),
      post_url: z.string().optional().describe("Webhook delivery URL (required for create)"),
      subscription_id: z.string().optional().describe("Subscription ID (required for delete)"),
    },
    handler: async (args, client) => {
      if (args.action === "create") {
        if (!args.resource_name || !args.post_url) {
          throw new Error("resource_name and post_url are required for create");
        }
        return client.createResourceSubscription(
          args.resource_name as import("../api/types.js").ResourceName,
          args.post_url as string,
        );
      }
      if (!args.subscription_id) {
        throw new Error("subscription_id is required for delete");
      }
      return client.deleteResourceSubscription(args.subscription_id as string);
    },
  },
];
