import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

function mockFetch(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers(),
    }),
  );
}

import { makeSaleCommand } from "../../src/commands/sales.js";
import { getToken } from "../../src/config/auth.js";

describe("sale command", () => {
  let logs: string[];

  beforeEach(() => {
    vi.mocked(getToken).mockReturnValue("test-token");
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("list", () => {
    it("displays sales", async () => {
      mockFetch({
        success: true,
        sales: [
          {
            id: "sale1",
            product_name: "My Ebook",
            email: "buyer@example.com",
            price: 999,
            formatted_display_price: "$9.99",
            created_at: "2024-06-15T10:00:00Z",
            refunded: false,
            chargebacked: false,
          },
        ],
      });

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["list"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("sale1");
      expect(output).toContain("My Ebook");
    });

    it("passes date filters to API", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({ success: true, sales: [] })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["list", "--after", "2024-01-01", "--before", "2024-12-31"], {
        from: "user",
      });

      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain("after=2024-01-01");
      expect(url).toContain("before=2024-12-31");
    });

    it("filters by product ID", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({ success: true, sales: [] })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["list", "--product", "prod123"], { from: "user" });

      expect(fetchMock.mock.calls[0][0]).toContain("product_id=prod123");
    });

    it("outputs JSON format", async () => {
      mockFetch({
        success: true,
        sales: [
          {
            id: "s1",
            product_name: "P",
            email: "e@example.com",
            price: 100,
            formatted_display_price: "$1.00",
            created_at: "2024-01-01T00:00:00Z",
            refunded: false,
            chargebacked: false,
          },
        ],
      });

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["list", "--json"], { from: "user" });

      const parsed = JSON.parse(logs.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("view", () => {
    it("displays sale details", async () => {
      mockFetch({
        success: true,
        sale: {
          id: "sale1",
          product_name: "My Ebook",
          email: "buyer@example.com",
          price: 999,
          formatted_display_price: "$9.99",
          created_at: "2024-06-15T10:00:00Z",
          refunded: false,
          chargebacked: false,
          quantity: 1,
          order_id: 12345,
          license_key: "LIC-123",
        },
      });

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["view", "sale1"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("sale1");
      expect(output).toContain("My Ebook");
    });
  });

  describe("ship", () => {
    it("marks sale as shipped", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, sale: { id: "sale1", shipped: true } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["ship", "sale1"], { from: "user" });

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[0][0]).toContain("mark_as_shipped");
    });

    it("includes tracking URL when provided", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, sale: { id: "sale1", shipped: true } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["ship", "sale1", "--tracking-url", "https://track.co/123"], {
        from: "user",
      });

      expect(fetchMock.mock.calls[0][1].body).toContain("tracking_url");
    });
  });

  describe("refund", () => {
    it("refunds a sale with --yes flag", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, sale: { id: "sale1", refunded: true } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["refund", "sale1", "--yes"], { from: "user" });

      expect(fetchMock.mock.calls[0][0]).toContain("refund");
      expect(logs.some((l) => l.includes("Refunded"))).toBe(true);
    });

    it("sends partial refund amount", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, sale: { id: "sale1", refunded: true } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeSaleCommand();
      await cmd.parseAsync(["refund", "sale1", "--amount", "500", "--yes"], { from: "user" });

      expect(fetchMock.mock.calls[0][1].body).toContain("amount_cents=500");
    });
  });
});
