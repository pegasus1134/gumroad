import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

import { makeApiCommand } from "../../src/commands/api.js";
import { getToken } from "../../src/config/auth.js";

describe("api command", () => {
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

  it("makes a GET request to the specified endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({ success: true, user: { name: "Test" } }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeApiCommand();
    await cmd.parseAsync(["/v2/user"], { from: "user" });

    expect(fetchMock.mock.calls[0][0]).toContain("/user");
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
  });

  it("strips /v2 prefix to avoid double-prefixing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ success: true })),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeApiCommand();
    await cmd.parseAsync(["/v2/products"], { from: "user" });

    const url = fetchMock.mock.calls[0][0];
    expect(url).not.toContain("/v2/v2/");
    expect(url).toContain("/products");
  });

  it("sends POST request with -X flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ success: true })),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeApiCommand();
    await cmd.parseAsync(["/v2/test", "-X", "POST"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("sends body fields with -f flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ success: true })),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeApiCommand();
    await cmd.parseAsync(
      ["/v2/test", "-X", "POST", "-f", "name=hello", "-f", "value=world"],
      { from: "user" },
    );

    const body = fetchMock.mock.calls[0][1].body;
    expect(body).toContain("name=hello");
    expect(body).toContain("value=world");
  });

  it("outputs JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        text: () =>
          Promise.resolve(
            JSON.stringify({
              success: true,
              products: [{ id: "p1" }, { id: "p2" }],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const cmd = makeApiCommand();
    await cmd.parseAsync(["/v2/products"], { from: "user" });

    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.products).toHaveLength(2);
  });
});
