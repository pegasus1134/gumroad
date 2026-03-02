import { Command } from "commander";
import { GumroadClient } from "../api/client.js";
import { formatPrice } from "../output/format.js";
import { getToken } from "../config/auth.js";
import { AuthenticationError, type GumroadSale } from "../api/types.js";
import { bold, dim, green, yellow, cyan } from "../output/colors.js";

function resolveClient(): GumroadClient {
  const token = getToken();
  if (!token) throw new AuthenticationError();
  return new GumroadClient({ token });
}

export function makeStatusCommand(): Command {
  const status = new Command("status")
    .description("Revenue dashboard — today, this week, this month")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const client = resolveClient();

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [user, sales, products] = await Promise.all([
        client.getUser(),
        client.listSales({
          after: monthStart.toISOString().split("T")[0],
          limit: 500,
        }),
        client.listProducts(),
      ]);

      const validSales = sales.filter((s) => !s.refunded && !s.chargebacked);

      const todaySales = validSales.filter(
        (s) => new Date(s.created_at) >= todayStart,
      );
      const weekSales = validSales.filter(
        (s) => new Date(s.created_at) >= weekStart,
      );

      const sumRevenue = (items: GumroadSale[]) =>
        items.reduce((sum, s) => sum + s.price, 0);

      const todayRevenue = sumRevenue(todaySales);
      const weekRevenue = sumRevenue(weekSales);
      const monthRevenue = sumRevenue(validSales);

      const publishedCount = products.filter((p) => p.published).length;
      const totalProducts = products.length;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              user: user.name,
              products: { published: publishedCount, total: totalProducts },
              today: { sales: todaySales.length, revenue_cents: todayRevenue },
              week: { sales: weekSales.length, revenue_cents: weekRevenue },
              month: { sales: validSales.length, revenue_cents: monthRevenue },
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(bold(`Dashboard — ${user.name || user.email || "Gumroad"}`));
      console.log(dim("─".repeat(40)));
      console.log(
        `${bold("Products:")}  ${cyan(String(publishedCount))} published / ${totalProducts} total`,
      );
      console.log("");
      console.log(
        `${bold("Today:")}     ${green(formatPrice(todayRevenue))}  ${dim(`(${todaySales.length} sales)`)}`,
      );
      console.log(
        `${bold("This week:")} ${green(formatPrice(weekRevenue))}  ${dim(`(${weekSales.length} sales)`)}`,
      );
      console.log(
        `${bold("This month:")} ${yellow(formatPrice(monthRevenue))}  ${dim(`(${validSales.length} sales)`)}`,
      );
    });

  return status;
}
