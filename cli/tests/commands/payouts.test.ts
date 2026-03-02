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

import { makePayoutCommand } from "../../src/commands/payouts.js";
import { getToken } from "../../src/config/auth.js";

describe("payout command", () => {
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
    it("displays payouts", async () => {
      mockFetch({
        success: true,
        payouts: [
          {
            id: "pay1",
            amount_cents: 10000,
            display_amount: "$100.00",
            is_completed: true,
            created_at: "2024-06-01T00:00:00Z",
            user_id: "u1",
          },
          {
            id: "pay2",
            amount_cents: 5000,
            display_amount: "$50.00",
            is_completed: false,
            created_at: "2024-06-15T00:00:00Z",
            user_id: "u1",
          },
        ],
      });

      const cmd = makePayoutCommand();
      await cmd.parseAsync(["list"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("pay1");
      expect(output).toContain("$100.00");
    });

    it("outputs JSON format", async () => {
      mockFetch({
        success: true,
        payouts: [
          {
            id: "pay1",
            amount_cents: 10000,
            display_amount: "$100.00",
            is_completed: true,
            created_at: "2024-06-01T00:00:00Z",
            user_id: "u1",
          },
        ],
      });

      const cmd = makePayoutCommand();
      await cmd.parseAsync(["list", "--json"], { from: "user" });

      const parsed = JSON.parse(logs.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].id).toBe("pay1");
    });
  });

  describe("view", () => {
    it("displays payout details", async () => {
      mockFetch({
        success: true,
        payouts: [
          {
            id: "pay1",
            amount_cents: 10000,
            display_amount: "$100.00",
            is_completed: true,
            created_at: "2024-06-01T00:00:00Z",
            user_id: "u1",
          },
        ],
      });

      const cmd = makePayoutCommand();
      await cmd.parseAsync(["view", "pay1"], { from: "user" });

      const output = logs.join("\n");
      expect(output).toContain("pay1");
      expect(output).toContain("$100.00");
    });

    it("handles payout not found", async () => {
      mockFetch({
        success: true,
        payouts: [],
      });

      const cmd = makePayoutCommand();
      await cmd.parseAsync(["view", "nonexistent"], { from: "user" });

      expect(process.exitCode).toBe(1);
    });
  });
});
