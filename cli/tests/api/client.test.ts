import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GumroadClient } from "../../src/api/client.js";
import { AuthenticationError, RateLimitError, GumroadApiError } from "../../src/api/types.js";

function mockFetch(response: {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const status = response.status ?? 200;
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    text: () => Promise.resolve(JSON.stringify(response.body ?? { success: true })),
    headers: new Headers(response.headers ?? {}),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("GumroadClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("request", () => {
    it("sends Bearer authorization header, not token in URL", async () => {
      const fetchMock = mockFetch({ body: { success: true, user: { name: "Test" } } });
      const client = new GumroadClient({ token: "test-token-123" });
      await client.getUser();

      const [url, options] = fetchMock.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer test-token-123");
      expect(url).not.toContain("access_token");
      expect(url).not.toContain("test-token-123");
    });

    it("sends Accept: application/json header", async () => {
      const fetchMock = mockFetch({ body: { success: true, user: {} } });
      const client = new GumroadClient({ token: "tok" });
      await client.getUser();

      expect(fetchMock.mock.calls[0][1].headers.Accept).toBe("application/json");
    });

    it("uses custom base URL when provided", async () => {
      const fetchMock = mockFetch({ body: { success: true } });
      const client = new GumroadClient({
        token: "tok",
        baseUrl: "https://custom.example.com/v2",
      });
      await client.request("/test");

      expect(fetchMock.mock.calls[0][0]).toContain("https://custom.example.com/v2/test");
    });

    it("appends query params for GET requests", async () => {
      const fetchMock = mockFetch({ body: { success: true } });
      const client = new GumroadClient({ token: "tok" });
      await client.request("/test", { params: { foo: "bar", baz: "qux" } });

      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain("foo=bar");
      expect(url).toContain("baz=qux");
    });

    it("sends form-encoded body for POST requests", async () => {
      const fetchMock = mockFetch({ body: { success: true } });
      const client = new GumroadClient({ token: "tok" });
      await client.request("/test", {
        method: "POST",
        body: { name: "hello", value: "world" },
      });

      const options = fetchMock.mock.calls[0][1];
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(options.body).toContain("name=hello");
      expect(options.body).toContain("value=world");
    });

    it("sends form-encoded body for PUT requests", async () => {
      const fetchMock = mockFetch({ body: { success: true } });
      const client = new GumroadClient({ token: "tok" });
      await client.request("/test", {
        method: "PUT",
        body: { key: "val" },
      });

      expect(fetchMock.mock.calls[0][1].body).toContain("key=val");
    });

    it("throws AuthenticationError on 401", async () => {
      mockFetch({ status: 401, body: { success: false } });
      const client = new GumroadClient({ token: "bad-token" });

      await expect(client.getUser()).rejects.toThrow(AuthenticationError);
    });

    it("throws RateLimitError on 429", async () => {
      mockFetch({
        status: 429,
        body: { success: false },
        headers: { "retry-after": "30" },
      });
      const client = new GumroadClient({ token: "tok" });

      await expect(client.request("/test")).rejects.toThrow(RateLimitError);
    });

    it("includes retry-after value in RateLimitError", async () => {
      mockFetch({
        status: 429,
        body: {},
        headers: { "retry-after": "60" },
      });
      const client = new GumroadClient({ token: "tok" });

      try {
        await client.request("/test");
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitError);
        expect((e as RateLimitError).retryAfter).toBe(60);
      }
    });

    it("throws GumroadApiError on other HTTP errors", async () => {
      mockFetch({ status: 500, body: { message: "Internal Server Error" } });
      const client = new GumroadClient({ token: "tok" });

      await expect(client.request("/test")).rejects.toThrow(GumroadApiError);
    });

    it("includes status code and response body in GumroadApiError", async () => {
      mockFetch({ status: 404, body: { message: "Not found" } });
      const client = new GumroadClient({ token: "tok" });

      try {
        await client.request("/test");
      } catch (e) {
        expect(e).toBeInstanceOf(GumroadApiError);
        expect((e as GumroadApiError).statusCode).toBe(404);
        expect((e as GumroadApiError).responseBody).toContain("Not found");
      }
    });

    it("throws on timeout", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, options: { signal?: AbortSignal }) => {
          return new Promise((_resolve, reject) => {
            if (options?.signal) {
              options.signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted", "AbortError"));
              });
            }
          });
        }),
      );
      const client = new GumroadClient({ token: "tok", timeoutMs: 50 });

      await expect(client.request("/test")).rejects.toThrow(/timed out/);
    });

    it("throws GumroadApiError when response is not valid JSON", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          text: () => Promise.resolve("not json"),
          headers: new Headers(),
        }),
      );
      const client = new GumroadClient({ token: "tok" });

      await expect(client.request("/test")).rejects.toThrow(/parse/i);
    });
  });

  describe("pagination", () => {
    it("paginateAll collects items across multiple pages", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              status: 200,
              statusText: "OK",
              text: () =>
                Promise.resolve(
                  JSON.stringify({
                    success: true,
                    sales: [{ id: "s1" }, { id: "s2" }],
                    next_page_key: "page2",
                  }),
                ),
              headers: new Headers(),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  sales: [{ id: "s3" }],
                }),
              ),
            headers: new Headers(),
          });
        }),
      );

      const client = new GumroadClient({ token: "tok" });
      const result = await client.paginateAll("/sales", "sales");

      expect(result).toHaveLength(3);
      expect(result.map((r: any) => r.id)).toEqual(["s1", "s2", "s3"]);
    });

    it("paginateAll respects limit parameter", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  items: [
                    { id: `item${callCount * 2 - 1}` },
                    { id: `item${callCount * 2}` },
                  ],
                  next_page_key: callCount < 5 ? `page${callCount + 1}` : undefined,
                }),
              ),
            headers: new Headers(),
          });
        }),
      );

      const client = new GumroadClient({ token: "tok" });
      const result = await client.paginateAll("/items", "items", { limit: 3 });

      expect(result).toHaveLength(3);
    });

    it("paginate yields pages as async generator", async () => {
      let callCount = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  items: [{ id: `p${callCount}` }],
                  next_page_key: callCount < 3 ? `page${callCount + 1}` : undefined,
                }),
              ),
            headers: new Headers(),
          });
        }),
      );

      const client = new GumroadClient({ token: "tok" });
      const pages: unknown[][] = [];

      for await (const page of client.paginate("/items", "items")) {
        pages.push(page);
      }

      expect(pages).toHaveLength(3);
    });
  });

  describe("ID validation", () => {
    it("rejects empty product ID", async () => {
      const client = new GumroadClient({ token: "tok" });
      await expect(client.getProduct("")).rejects.toThrow(/invalid.*product.*id/i);
    });

    it("rejects product ID with special characters", async () => {
      const client = new GumroadClient({ token: "tok" });
      await expect(client.getProduct("../../../etc/passwd")).rejects.toThrow(
        /invalid.*characters/i,
      );
    });

    it("rejects sale ID with injection attempt", async () => {
      const client = new GumroadClient({ token: "tok" });
      await expect(client.getSale("id; rm -rf /")).rejects.toThrow(
        /invalid.*characters/i,
      );
    });

    it("accepts valid alphanumeric IDs", async () => {
      mockFetch({ body: { success: true, product: { id: "abc-123", name: "Test" } } });
      const client = new GumroadClient({ token: "tok" });
      const product = await client.getProduct("abc-123");
      expect(product.id).toBe("abc-123");
    });
  });

  describe("API methods", () => {
    it("getUser returns user data", async () => {
      mockFetch({
        body: {
          success: true,
          user: { name: "Sahil", email: "seller@example.com", user_id: "123" },
        },
      });
      const client = new GumroadClient({ token: "tok" });
      const user = await client.getUser();

      expect(user.name).toBe("Sahil");
      expect(user.email).toBe("seller@example.com");
    });

    it("listProducts returns array of products", async () => {
      mockFetch({
        body: {
          success: true,
          products: [
            { id: "p1", name: "Product 1" },
            { id: "p2", name: "Product 2" },
          ],
        },
      });
      const client = new GumroadClient({ token: "tok" });
      const products = await client.listProducts();

      expect(products).toHaveLength(2);
      expect(products[0].name).toBe("Product 1");
    });

    it("listSales passes date filters as params", async () => {
      const fetchMock = mockFetch({ body: { success: true, sales: [] } });
      const client = new GumroadClient({ token: "tok" });
      await client.listSales({
        after: "2024-01-01",
        before: "2024-12-31",
        email: "test@example.com",
      });

      const url = fetchMock.mock.calls[0][0];
      expect(url).toContain("after=2024-01-01");
      expect(url).toContain("before=2024-12-31");
      expect(url).toContain("email=test%40example.com");
    });

    it("refundSale sends PUT request with amount", async () => {
      const fetchMock = mockFetch({
        body: { success: true, sale: { id: "sale1", refunded: true } },
      });
      const client = new GumroadClient({ token: "tok" });
      await client.refundSale("sale1", 500);

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[0][1].body).toContain("amount_cents=500");
    });

    it("deleteProduct sends DELETE request", async () => {
      const fetchMock = mockFetch({ body: { success: true } });
      const client = new GumroadClient({ token: "tok" });
      await client.deleteProduct("prod1");

      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });

    it("createOfferCode sends POST with all fields", async () => {
      const fetchMock = mockFetch({
        body: {
          success: true,
          offer_code: { id: "oc1", name: "SUMMER20", amount_off: 20 },
        },
      });
      const client = new GumroadClient({ token: "tok" });
      await client.createOfferCode("prod1", {
        name: "SUMMER20",
        amount_off: 20,
        offer_type: "percent",
        max_purchase_count: 100,
      });

      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      const body = fetchMock.mock.calls[0][1].body;
      expect(body).toContain("name=SUMMER20");
      expect(body).toContain("amount_off=20");
      expect(body).toContain("offer_type=percent");
      expect(body).toContain("max_purchase_count=100");
    });

    it("createResourceSubscription sends PUT request", async () => {
      const fetchMock = mockFetch({
        body: {
          success: true,
          resource_subscription: { id: "rs1", resource_name: "sale" },
        },
      });
      const client = new GumroadClient({ token: "tok" });
      await client.createResourceSubscription("sale", "https://example.com/webhook");

      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      const body = fetchMock.mock.calls[0][1].body;
      expect(body).toContain("resource_name=sale");
      expect(body).toContain("post_url=https");
    });

    it("verifyLicense sends POST with product_id and license_key", async () => {
      const fetchMock = mockFetch({
        body: {
          success: true,
          uses: 3,
          purchase: { email: "buyer@example.com" },
        },
      });
      const client = new GumroadClient({ token: "tok" });
      const result = await client.verifyLicense("prod1", "LICENSE-KEY-123");

      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(result.uses).toBe(3);
    });
  });
});
