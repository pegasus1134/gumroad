import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatSingle, type FormatOptions } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError } from "../api/types.js";

export function makeUserCommand(): Command {
  const user = new Command("user")
    .description("Show your Gumroad profile")
    .option("--json [fields]", "Output as JSON (optionally specify fields)")
    .action(async (opts: { json?: boolean | string }) => {
      const token = getToken();
      if (!token) throw new AuthenticationError();

      const client = new GumroadClient({ token });
      const profile = await client.getUser();

      const formatOpts: FormatOptions = {};
      if (opts.json !== undefined) {
        formatOpts.json =
          typeof opts.json === "string"
            ? opts.json.split(",").map((s) => s.trim())
            : true;
      }

      console.log(
        formatSingle(
          profile as unknown as Record<string, unknown>,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "bio", label: "Bio" },
            { key: "profile_url", label: "Profile" },
            { key: "twitter_handle", label: "Twitter" },
          ],
          formatOpts,
        ),
      );
    });

  return user;
}
