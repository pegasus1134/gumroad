import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tools } from "../../src/tools/index.js";
import { GumroadClient } from "../../src/api/client.js";

function mockFetchForClient(responses: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      for (const [pattern, body] of Object.entries(responses)) {
        if (url.includes(pattern)) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () => Promise.resolve(JSON.stringify(body)),
            headers: new Headers(),
          });
        }
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers(),
      });
    }),
  );
}

function createClient() {
  return new GumroadClient({ token: "test-token" });
}

describe("MCP tools", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports all expected tools", () => {
    const names = tools.map((t) => t.name);
    expect(names).toContain("gumroad_business_overview");
    expect(names).toContain("gumroad_get_user");
    expect(names).toContain("gumroad_list_products");
    expect(names).toContain("gumroad_get_product");
    expect(names).toContain("gumroad_search_products");
    expect(names).toContain("gumroad_list_sales");
    expect(names).toContain("gumroad_get_sale");
    expect(names).toContain("gumroad_revenue_summary");
    expect(names).toContain("gumroad_toggle_product");
    expect(names).toContain("gumroad_refund_sale");
    expect(names).toContain("gumroad_ship_sale");
    expect(names).toContain("gumroad_verify_license");
    expect(names).toContain("gumroad_list_subscribers");
    expect(names).toContain("gumroad_list_payouts");
    expect(names).toContain("gumroad_create_offer");
    expect(names).toContain("gumroad_manage_webhook");
  });

  it("all tools have name, description, inputSchema, and handler", () => {
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.inputSchema).toBe("object");
      expect(typeof tool.handler).toBe("function");
    }
  });

  describe("gumroad_business_overview", () => {
    it("combines user, products, and sales into a single response", async () => {
      mockFetchForClient({
        "/user": {
          success: true,
          user: { name: "TestUser", email: "test@example.com", profile_url: "https://gumroad.com/test" },
        },
        "/products": {
          success: true,
          products: [
            { id: "p1", name: "Product", price: 999, published: true, sales_count: 10, sales_usd_cents: 9990, short_url: "https://gum.co/p1" },
          ],
        },
        "/sales": {
          success: true,
          sales: [
            { id: "s1", product_name: "Product", email: "b@example.com", formatted_display_price: "$9.99", created_at: "2024-01-01", refunded: false },
          ],
        },
      });

      const tool = tools.find((t) => t.name === "gumroad_business_overview")!;
      const result = (await tool.handler({}, createClient())) as any;

      expect(result.user.name).toBe("TestUser");
      expect(result.summary.total_products).toBe(1);
      expect(result.products).toHaveLength(1);
      expect(result.recent_sales).toHaveLength(1);
    });
  });

  describe("gumroad_search_products", () => {
    it("filters products by name query", async () => {
      mockFetchForClient({
        "/products": {
          success: true,
          products: [
            { id: "p1", name: "React Course", price: 4999, published: true, description: null },
            { id: "p2", name: "Python Ebook", price: 999, published: true, description: null },
            { id: "p3", name: "React Templates", price: 1999, published: false, description: null },
          ],
        },
      });

      const tool = tools.find((t) => t.name === "gumroad_search_products")!;
      const result = (await tool.handler({ query: "react" }, createClient())) as any[];

      expect(result).toHaveLength(2);
      expect(result.every((p: any) => p.name.toLowerCase().includes("react"))).toBe(true);
    });

    it("filters by published status", async () => {
      mockFetchForClient({
        "/products": {
          success: true,
          products: [
            { id: "p1", name: "A", price: 100, published: true, description: null },
            { id: "p2", name: "B", price: 200, published: false, description: null },
          ],
        },
      });

      const tool = tools.find((t) => t.name === "gumroad_search_products")!;
      const result = (await tool.handler({ published: true }, createClient())) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
    });

    it("filters by price range", async () => {
      mockFetchForClient({
        "/products": {
          success: true,
          products: [
            { id: "p1", name: "A", price: 500, published: true, description: null },
            { id: "p2", name: "B", price: 2000, published: true, description: null },
            { id: "p3", name: "C", price: 5000, published: true, description: null },
          ],
        },
      });

      const tool = tools.find((t) => t.name === "gumroad_search_products")!;
      const result = (await tool.handler(
        { min_price_cents: 1000, max_price_cents: 3000 },
        createClient(),
      )) as any[];

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p2");
    });
  });

  describe("gumroad_revenue_summary", () => {
    it("excludes refunded and chargebacked sales", async () => {
      const now = new Date();
      mockFetchForClient({
        "/sales": {
          success: true,
          sales: [
            { id: "s1", price: 999, created_at: now.toISOString(), refunded: false, chargebacked: false },
            { id: "s2", price: 500, created_at: now.toISOString(), refunded: true, chargebacked: false },
            { id: "s3", price: 1999, created_at: now.toISOString(), refunded: false, chargebacked: true },
          ],
        },
      });

      const tool = tools.find((t) => t.name === "gumroad_revenue_summary")!;
      const result = (await tool.handler({}, createClient())) as any;

      expect(result.today.revenue_cents).toBe(999);
      expect(result.today.sales_count).toBe(1);
    });
  });

  describe("gumroad_toggle_product", () => {
    it("enables a product when enabled is true", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, product: { id: "p1", name: "Test" } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const tool = tools.find((t) => t.name === "gumroad_toggle_product")!;
      await tool.handler({ product_id: "p1", enabled: true }, createClient());

      expect(fetchMock.mock.calls[0][0]).toContain("/enable");
    });

    it("disables a product when enabled is false", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, product: { id: "p1", name: "Test" } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const tool = tools.find((t) => t.name === "gumroad_toggle_product")!;
      await tool.handler({ product_id: "p1", enabled: false }, createClient());

      expect(fetchMock.mock.calls[0][0]).toContain("/disable");
    });
  });

  describe("gumroad_manage_webhook", () => {
    it("creates a webhook subscription", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              resource_subscription: { id: "rs1", resource_name: "sale" },
            }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const tool = tools.find((t) => t.name === "gumroad_manage_webhook")!;
      const result = await tool.handler(
        { action: "create", resource_name: "sale", post_url: "https://example.com/hook" },
        createClient(),
      );

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(result).toBeTruthy();
    });

    it("throws error when create is missing required fields", async () => {
      const tool = tools.find((t) => t.name === "gumroad_manage_webhook")!;

      await expect(
        tool.handler({ action: "create" }, createClient()),
      ).rejects.toThrow(/required/);
    });

    it("throws error when delete is missing subscription_id", async () => {
      const tool = tools.find((t) => t.name === "gumroad_manage_webhook")!;

      await expect(
        tool.handler({ action: "delete" }, createClient()),
      ).rejects.toThrow(/required/);
    });
  });
});
