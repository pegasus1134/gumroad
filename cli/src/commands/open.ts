import { Command } from "commander";
import { execFile } from "node:child_process";
import { GumroadClient } from "../api/client.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";
import { dim } from "../output/colors.js";

function openUrl(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  execFile(cmd, [url]);
}

export function makeOpenCommand(): Command {
  const open = new Command("open").description("Open Gumroad pages in browser");

  open
    .command("dashboard")
    .description("Open the Gumroad dashboard")
    .action(() => {
      const url = "https://app.gumroad.com/dashboard";
      console.log(dim(`Opening ${url}`));
      openUrl(url);
    });

  open
    .command("product <product-id>")
    .description("Open a product page")
    .action(async (productId: string) => {
      const token = getToken();
      if (!token) throw new AuthenticationError();
      const client = new GumroadClient({ token });
      const p = await client.getProduct(productId);
      console.log(dim(`Opening ${p.short_url}`));
      openUrl(p.short_url);
    });

  open
    .command("profile")
    .description("Open your Gumroad profile")
    .action(async () => {
      const token = getToken();
      if (!token) throw new AuthenticationError();
      const client = new GumroadClient({ token });
      const user = await client.getUser();
      console.log(dim(`Opening ${user.profile_url}`));
      openUrl(user.profile_url);
    });

  open
    .command("settings")
    .description("Open Gumroad settings")
    .action(() => {
      const url = "https://app.gumroad.com/settings";
      console.log(dim(`Opening ${url}`));
      openUrl(url);
    });

  return open;
}
