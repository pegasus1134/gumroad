import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeAuthCommand } from "../../src/commands/auth.js";

function mockFetch(response: { status?: number; body?: unknown }) {
  const status = response.status ?? 200;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: "OK",
      text: () => Promise.resolve(JSON.stringify(response.body ?? { success: true })),
      headers: new Headers(),
    }),
  );
}

vi.mock("../../src/config/auth.js", () => ({
  getToken: vi.fn(),
  saveToken: vi.fn(),
  removeToken: vi.fn(),
  isAuthenticated: vi.fn(),
}));

import { getToken, saveToken, removeToken } from "../../src/config/auth.js";

describe("auth command", () => {
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    logs = [];
    errors = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("login", () => {
    it("saves token after successful validation", async () => {
      mockFetch({
        body: {
          success: true,
          user: { name: "TestUser", email: "test@example.com", user_id: "u1" },
        },
      });

      const auth = makeAuthCommand();
      await auth.parseAsync(["login", "--token", "valid-token"], { from: "user" });

      expect(saveToken).toHaveBeenCalledWith("valid-token");
      expect(logs.some((l) => l.includes("TestUser"))).toBe(true);
    });

    it("rejects invalid token", async () => {
      mockFetch({ status: 401, body: { success: false } });

      const auth = makeAuthCommand();
      await auth.parseAsync(["login", "--token", "bad-token"], { from: "user" });

      expect(saveToken).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });
  });

  describe("logout", () => {
    it("removes token and confirms", async () => {
      vi.mocked(removeToken).mockReturnValue(true);

      const auth = makeAuthCommand();
      await auth.parseAsync(["logout"], { from: "user" });

      expect(removeToken).toHaveBeenCalled();
      expect(logs.some((l) => l.includes("Logged out"))).toBe(true);
    });

    it("handles not logged in", async () => {
      vi.mocked(removeToken).mockReturnValue(false);

      const auth = makeAuthCommand();
      await auth.parseAsync(["logout"], { from: "user" });

      expect(logs.some((l) => l.includes("Not logged in"))).toBe(true);
    });
  });

  describe("status", () => {
    it("shows user info when authenticated", async () => {
      vi.mocked(getToken).mockReturnValue("valid-token");
      mockFetch({
        body: {
          success: true,
          user: {
            name: "Sahil",
            email: "seller@example.com",
            profile_url: "https://gumroad.com/sahil",
            user_id: "u1",
          },
        },
      });

      const auth = makeAuthCommand();
      await auth.parseAsync(["status"], { from: "user" });

      expect(logs.some((l) => l.includes("Authenticated"))).toBe(true);
      expect(logs.some((l) => l.includes("Sahil"))).toBe(true);
    });

    it("shows error when not authenticated", async () => {
      vi.mocked(getToken).mockReturnValue(null);

      const auth = makeAuthCommand();
      await auth.parseAsync(["status"], { from: "user" });

      expect(process.exitCode).toBe(1);
      expect(logs.some((l) => l.includes("Not authenticated"))).toBe(true);
    });

    it("detects token source from environment variable", async () => {
      vi.mocked(getToken).mockReturnValue("env-token");
      process.env.GUMROAD_TOKEN = "env-token";
      mockFetch({
        body: {
          success: true,
          user: { name: "User", email: "u@example.com", user_id: "u1", profile_url: "" },
        },
      });

      const auth = makeAuthCommand();
      await auth.parseAsync(["status"], { from: "user" });

      expect(logs.some((l) => l.includes("environment variable"))).toBe(true);

      delete process.env.GUMROAD_TOKEN;
    });
  });
});
