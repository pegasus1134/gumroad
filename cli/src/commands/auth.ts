import { Command } from "commander";
import { getToken, saveToken, removeToken } from "../config/auth.js";
import { GumroadClient } from "../api/client.js";
import { bold, green, red, yellow, dim } from "../output/colors.js";

export function makeAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  auth
    .command("login")
    .description("Authenticate with a Gumroad API token")
    .option("-t, --token <token>", "API access token")
    .action(async (opts: { token?: string }) => {
      let token = opts.token;

      if (!token) {
        if (!process.stdin.isTTY) {
          console.error(red("Error: --token is required in non-interactive mode"));
          process.exitCode = 1;
          return;
        }
        token = await promptToken();
      }

      if (!token) {
        console.error(red("Error: no token provided"));
        process.exitCode = 1;
        return;
      }

      process.stderr.write(dim("Validating token...") + "\n");

      try {
        const client = new GumroadClient({ token });
        const user = await client.getUser();
        saveToken(token);
        console.log(green("Authenticated as ") + bold(user.name || user.email || user.user_id));
      } catch (error) {
        console.error(red("Authentication failed: invalid token"));
        process.exitCode = 1;
      }
    });

  auth
    .command("logout")
    .description("Remove stored authentication token")
    .action(() => {
      const removed = removeToken();
      if (removed) {
        console.log(green("Logged out successfully."));
      } else {
        console.log(yellow("Not logged in."));
      }
    });

  auth
    .command("status")
    .description("Show current authentication status")
    .action(async () => {
      const token = getToken();
      if (!token) {
        console.log(red("Not authenticated."));
        console.log(dim("Run: gumroad auth login"));
        process.exitCode = 1;
        return;
      }

      const source = process.env.GUMROAD_TOKEN ? "environment variable" : "config file";

      try {
        const client = new GumroadClient({ token });
        const user = await client.getUser();
        console.log(green("Authenticated") + dim(` (via ${source})`));
        console.log(`${bold("User:")}  ${user.name || "—"}`);
        console.log(`${bold("Email:")} ${user.email || "—"}`);
        console.log(`${bold("URL:")}   ${user.profile_url}`);
      } catch {
        console.log(yellow("Token stored") + dim(` (via ${source})`) + red(" but invalid"));
        process.exitCode = 1;
      }
    });

  return auth;
}

function promptToken(): Promise<string> {
  return new Promise((resolve) => {
    const readline = require("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question("Enter your Gumroad API token: ", (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
