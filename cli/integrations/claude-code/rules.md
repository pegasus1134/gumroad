# Gumroad CLI — Claude Code Rules

When working with Gumroad data, use the `gumroad` MCP server tools.

## Quick Start

```bash
# Add the MCP server to Claude Code
claude mcp add gumroad -- node /path/to/cli/dist/mcp.js
```

## Available Tools

### Discovery
- `gumroad_business_overview` — Start here. Gets user profile, all products with stats, recent sales in one call.

### Read
- `gumroad_get_user` — User profile
- `gumroad_list_products` / `gumroad_get_product` — Product catalog
- `gumroad_search_products` — Search by name, price range, status
- `gumroad_list_sales` / `gumroad_get_sale` — Sales with date/product/email filters
- `gumroad_list_subscribers` — Membership subscribers
- `gumroad_list_payouts` — Payout history
- `gumroad_revenue_summary` — Today/week/month revenue (excludes refunds)

### Write
- `gumroad_toggle_product` — Enable/disable products
- `gumroad_refund_sale` — Full or partial refunds
- `gumroad_ship_sale` — Mark as shipped with tracking
- `gumroad_verify_license` — Verify license keys
- `gumroad_create_offer` — Create discount codes
- `gumroad_manage_webhook` — Create/delete webhooks

## Best Practices

1. **Start with `gumroad_business_overview`** to understand the seller's store before diving into specifics
2. **Use `gumroad_revenue_summary`** for financial questions — it correctly excludes refunded/chargebacked sales
3. **Use `gumroad_search_products`** instead of listing all products when looking for specific ones
4. **Always confirm** before executing destructive operations (refunds, disabling products)
