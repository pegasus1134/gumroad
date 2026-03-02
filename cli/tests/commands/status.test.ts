import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

import { makeStatusCommand } from "../../src/commands/status.js";
import { getToken } from "../../src/config/auth.js";

describe("status command", () => {
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

  function mockDashboardData() {
    const now = new Date();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/user")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  user: { name: "TestSeller", email: "seller@example.com", user_id: "u1", profile_url: "" },
                }),
              ),
            headers: new Headers(),
          });
        }
        if (url.includes("/sales")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  sales: [
                    {
                      id: "s1",
                      price: 999,
                      created_at: now.toISOString(),
                      refunded: false,
                      chargebacked: false,
                      product_name: "P1",
                    },
                    {
                      id: "s2",
                      price: 1999,
                      created_at: now.toISOString(),
                      refunded: false,
                      chargebacked: false,
                      product_name: "P2",
                    },
                    {
                      id: "s3",
                      price: 500,
                      created_at: now.toISOString(),
                      refunded: true,
                      chargebacked: false,
                      product_name: "P1",
                    },
                  ],
                }),
              ),
            headers: new Headers(),
          });
        }
        if (url.includes("/products")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  success: true,
                  products: [
                    { id: "p1", name: "P1", published: true },
                    { id: "p2", name: "P2", published: true },
                    { id: "p3", name: "P3", published: false },
                  ],
                }),
              ),
            headers: new Headers(),
          });
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

  it("displays revenue dashboard", async () => {
    mockDashboardData();

    const cmd = makeStatusCommand();
    await cmd.parseAsync([], { from: "user" });

    const output = logs.join("\n");
    expect(output).toContain("TestSeller");
    expect(output).toContain("2 published");
    expect(output).toContain("$29.98");
  });

  it("excludes refunded sales from revenue", async () => {
    mockDashboardData();

    const cmd = makeStatusCommand();
    await cmd.parseAsync([], { from: "user" });

    const output = logs.join("\n");
    expect(output).not.toContain("$34.98");
    expect(output).toContain("$29.98");
  });

  it("outputs JSON when --json is set", async () => {
    mockDashboardData();

    const cmd = makeStatusCommand();
    await cmd.parseAsync(["--json"], { from: "user" });

    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.user).toBe("TestSeller");
    expect(parsed.products.published).toBe(2);
    expect(parsed.products.total).toBe(3);
  });
});
