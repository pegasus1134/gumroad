#!/usr/bin/env node

import { Command } from "commander";
import { makeAuthCommand } from "./commands/auth.js";
import { makeUserCommand } from "./commands/user.js";
import { makeProductCommand } from "./commands/products.js";
import { makeSaleCommand } from "./commands/sales.js";
import { makeLicenseCommand } from "./commands/licenses.js";
import { makeSubscriberCommand } from "./commands/subscribers.js";
import { makePayoutCommand } from "./commands/payouts.js";
import { makeOfferCommand } from "./commands/offers.js";
import { makeVariantCommand } from "./commands/variants.js";
import { makeFieldCommand } from "./commands/fields.js";
import { makeWebhookCommand } from "./commands/webhooks.js";
import { makeStatusCommand } from "./commands/status.js";
import { makeOpenCommand } from "./commands/open.js";
import { makeApiCommand } from "./commands/api.js";
import { GumroadApiError } from "./api/types.js";
import { red, dim } from "./output/colors.js";

const program = new Command()
  .name("gumroad")
  .description("AI-native CLI for Gumroad — manage your store from the terminal")
  .version("0.1.2");

program.addCommand(makeAuthCommand());
program.addCommand(makeUserCommand());
program.addCommand(makeProductCommand());
program.addCommand(makeSaleCommand());
program.addCommand(makeLicenseCommand());
program.addCommand(makeSubscriberCommand());
program.addCommand(makePayoutCommand());
program.addCommand(makeOfferCommand());
program.addCommand(makeVariantCommand());
program.addCommand(makeFieldCommand());
program.addCommand(makeWebhookCommand());
program.addCommand(makeStatusCommand());
program.addCommand(makeOpenCommand());
program.addCommand(makeApiCommand());

program.hook("postAction", () => {});

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof GumroadApiError) {
      console.error(red(`Error: ${error.message}`));
      if (error.responseBody) {
        try {
          const body = JSON.parse(error.responseBody);
          if (body.message) {
            console.error(dim(body.message));
          }
        } catch {
        }
      }
      process.exitCode = 1;
    } else if (error instanceof Error) {
      console.error(red(`Error: ${error.message}`));
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}

main();
