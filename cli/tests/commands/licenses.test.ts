import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

import { makeLicenseCommand } from "../../src/commands/licenses.js";
import { getToken } from "../../src/config/auth.js";

describe("license command", () => {
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

  it("verifies a license key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            uses: 5,
            purchase: {
              email: "buyer@example.com",
              product_name: "My App",
              created_at: "2024-01-15T00:00:00Z",
            },
          }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeLicenseCommand();
    await cmd.parseAsync(["verify", "prod1", "LICENSE-KEY"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body).toContain("product_id=prod1");
    expect(fetchMock.mock.calls[0][1].body).toContain("license_key=LICENSE-KEY");
  });

  it("enables a license key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({ success: true, uses: 3, purchase: {} }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeLicenseCommand();
    await cmd.parseAsync(["enable", "prod1", "KEY123"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(logs.some((l) => l.includes("enabled"))).toBe(true);
  });

  it("disables a license key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({ success: true, uses: 3, purchase: {} }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeLicenseCommand();
    await cmd.parseAsync(["disable", "prod1", "KEY123"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(logs.some((l) => l.includes("disabled"))).toBe(true);
  });

  it("decrements a license use count", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({ success: true, uses: 2, purchase: {} }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeLicenseCommand();
    await cmd.parseAsync(["decrement", "prod1", "KEY123"], { from: "user" });

    expect(fetchMock.mock.calls[0][0]).toContain("decrement_uses_count");
    expect(logs.some((l) => l.includes("2"))).toBe(true);
  });

  it("outputs license verification as JSON", async () => {
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
              uses: 1,
              purchase: {
                email: "test@example.com",
                product_name: "App",
                created_at: "2024-01-01T00:00:00Z",
              },
            }),
          ),
        headers: new Headers(),
      }),
    );

    const cmd = makeLicenseCommand();
    await cmd.parseAsync(["verify", "prod1", "KEY", "--json"], { from: "user" });

    const parsed = JSON.parse(logs.join("\n"));
    expect(parsed.success).toBe(true);
    expect(parsed.uses).toBe(1);
  });
});
