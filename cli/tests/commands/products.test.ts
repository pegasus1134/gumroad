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

import { makeProductCommand } from "../../src/commands/products.js";
import { getToken } from "../../src/config/auth.js";

describe("product command", () => {
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
    it("displays products in table format", async () => {
      mockFetch({
        success: true,
        products: [
          {
            id: "prod1",
            name: "My Ebook",
            price: 999,
            published: true,
            sales_count: 42,
            sales_usd_cents: 41958,
            short_url: "https://gum.co/ebook",
          },
          {
            id: "prod2",
            name: "Course",
            price: 4999,
            published: false,
            sales_count: 0,
            sales_usd_cents: 0,
            short_url: "https://gum.co/course",
          },
        ],
      });

      const cmd = makeProductCommand();
      await cmd.parseAsync(["list"], { from: "user" });

      expect(logs.length).toBeGreaterThan(0);
      const output = logs.join("\n");
      expect(output).toContain("prod1");
      expect(output).toContain("My Ebook");
    });

    it("outputs JSON when --json flag is set", async () => {
      mockFetch({
        success: true,
        products: [
          {
            id: "prod1",
            name: "My Ebook",
            price: 999,
            published: true,
            sales_count: 42,
            sales_usd_cents: 41958,
          },
        ],
      });

      const cmd = makeProductCommand();
      await cmd.parseAsync(["list", "--json"], { from: "user" });

      const output = logs.join("\n");
      const parsed = JSON.parse(output);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("prod1");
    });

    it("filters JSON fields when specified", async () => {
      mockFetch({
        success: true,
        products: [
          {
            id: "prod1",
            name: "My Ebook",
            price: 999,
            published: true,
            sales_count: 42,
            sales_usd_cents: 41958,
          },
        ],
      });

      const cmd = makeProductCommand();
      await cmd.parseAsync(["list", "--json", "id,name"], { from: "user" });

      const output = logs.join("\n");
      const parsed = JSON.parse(output);
      expect(parsed[0].id).toBe("prod1");
      expect(parsed[0].name).toBe("My Ebook");
      expect(parsed[0].price).toBeUndefined();
    });

    it("outputs only IDs in quiet mode", async () => {
      mockFetch({
        success: true,
        products: [
          { id: "prod1", name: "A", price: 0, published: true, sales_count: 0, sales_usd_cents: 0 },
          { id: "prod2", name: "B", price: 0, published: true, sales_count: 0, sales_usd_cents: 0 },
        ],
      });

      const cmd = makeProductCommand();
      await cmd.parseAsync(["list", "--quiet"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("prod1");
      expect(output).toContain("prod2");
      expect(output).not.toContain("Name");
    });
  });

  describe("view", () => {
    it("displays product details", async () => {
      mockFetch({
        success: true,
        product: {
          id: "prod1",
          name: "My Ebook",
          description: "A great ebook",
          price: 999,
          published: true,
          sales_count: 42,
          sales_usd_cents: 41958,
          short_url: "https://gum.co/ebook",
        },
      });

      const cmd = makeProductCommand();
      await cmd.parseAsync(["view", "prod1"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("My Ebook");
      expect(output).toContain("$9.99");
    });
  });

  describe("enable", () => {
    it("enables a product", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, product: { id: "prod1", name: "My Ebook" } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeProductCommand();
      await cmd.parseAsync(["enable", "prod1"], { from: "user" });

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[0][0]).toContain("/enable");
      expect(logs.some((l) => l.includes("Enabled"))).toBe(true);
    });
  });

  describe("disable", () => {
    it("disables product with --yes flag", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({ success: true, product: { id: "prod1", name: "My Ebook" } }),
          ),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeProductCommand();
      await cmd.parseAsync(["disable", "prod1", "--yes"], { from: "user" });

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[0][0]).toContain("/disable");
    });
  });

  describe("delete", () => {
    it("deletes product with --yes flag", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () => Promise.resolve(JSON.stringify({ success: true })),
        headers: new Headers(),
      });
      vi.stubGlobal("fetch", fetchMock);

      const cmd = makeProductCommand();
      await cmd.parseAsync(["delete", "prod1", "--yes"], { from: "user" });

      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
      expect(logs.some((l) => l.includes("Deleted"))).toBe(true);
    });
  });
});
