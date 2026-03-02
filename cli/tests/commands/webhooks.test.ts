import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn().mockReturnValue("test-token"),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn().mockReturnValue(true),
}));

import { makeWebhookCommand } from "../../src/commands/webhooks.js";
import { getToken } from "../../src/config/auth.js";

describe("webhook command", () => {
  let logs: string[];

  beforeEach(() => {
    vi.mocked(getToken).mockReturnValue("test-token");
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists webhooks", async () => {
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
              resource_subscriptions: [
                {
                  id: "rs1",
                  resource_name: "sale",
                  post_url: "https://example.com/webhook",
                },
              ],
            }),
          ),
        headers: new Headers(),
      }),
    );

    const cmd = makeWebhookCommand();
    await cmd.parseAsync(["list"], { from: "user" });

    const output = logs.join("\n");
    expect(output).toContain("rs1");
    expect(output).toContain("sale");
  });

  it("creates a webhook subscription", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            resource_subscription: {
              id: "rs1",
              resource_name: "sale",
              post_url: "https://example.com/hook",
            },
          }),
        ),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeWebhookCommand();
    await cmd.parseAsync(
      ["create", "--event", "sale", "--url", "https://example.com/hook"],
      { from: "user" },
    );

    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(logs.some((l) => l.includes("Created"))).toBe(true);
  });

  it("rejects invalid event name", async () => {
    const cmd = makeWebhookCommand();
    await cmd.parseAsync(
      ["create", "--event", "invalid_event", "--url", "https://example.com"],
      { from: "user" },
    );

    expect(process.exitCode).toBe(1);
  });

  it("deletes a webhook with --yes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify({ success: true })),
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    const cmd = makeWebhookCommand();
    await cmd.parseAsync(["delete", "rs1", "--yes"], { from: "user" });

    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    expect(logs.some((l) => l.includes("Deleted"))).toBe(true);
  });
});
