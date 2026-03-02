import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

import { makeOfferCommand } from "../../src/commands/offers.js";
import { getToken } from "../../src/config/auth.js";

describe("offer command", () => {
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

  it("lists offer codes", async () => {
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
              offer_codes: [
                {
                  id: "oc1",
                  name: "SUMMER20",
                  percent_off: 20,
                  times_used: 5,
                  universal: false,
                },
              ],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const cmd = makeOfferCommand();
    await cmd.parseAsync(["list", "prod1"], { from: "user" });

    const output = logs.join("\n");
    expect(output).toContain("SUMMER20");
    expect(output).toContain("20%");
  });

  it("creates an offer code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            offer_code: { id: "oc1", name: "NEWYEAR", amount_off: 500 },
          }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeOfferCommand();
    await cmd.parseAsync(
      ["create", "prod1", "--name", "NEWYEAR", "--amount", "500", "--type", "cents"],
      { from: "user" },
    );

    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(logs.some((l) => l.includes("Created"))).toBe(true);
  });

  it("updates an offer code max purchase count", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            offer_code: { id: "oc1", name: "SUMMER20" },
          }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeOfferCommand();
    await cmd.parseAsync(["update", "prod1", "oc1", "--max", "50"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[0][1].body).toContain("max_purchase_count=50");
  });

  it("deletes an offer code with --yes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ success: true })),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeOfferCommand();
    await cmd.parseAsync(["delete", "prod1", "oc1", "--yes"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(logs.some((l) => l.includes("Deleted"))).toBe(true);
  });
});
