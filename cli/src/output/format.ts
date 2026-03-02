import { bold, dim, gray } from "./colors.js";

const isTTY =
  process.env.GUMROAD_FORCE_TTY === "1" || process.stdout.isTTY === true;

export interface FormatOptions {
  json?: boolean | string[];
  jq?: string;
  quiet?: boolean;
}

export function formatOutput<T extends Record<string, unknown>>(
  items: T[],
  columns: { key: keyof T; label: string; width?: number }[],
  options: FormatOptions = {},
): string {
  if (options.quiet) {
    return items.map((item) => String(item.id ?? "")).join("\n");
  }

  if (options.json) {
    return formatJson(items, options.json, options.jq);
  }

  if (!isTTY) {
    return formatTsv(items, columns);
  }

  return formatTable(items, columns);
}

function formatJson<T extends Record<string, unknown>>(
  items: T[],
  fields: boolean | string[],
  jq?: string,
): string {
  let data: unknown = items;

  if (Array.isArray(fields) && fields.length > 0) {
    data = items.map((item) => {
      const filtered: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in item) {
          filtered[field] = item[field];
        }
      }
      return filtered;
    });
  }

  if (jq) {
    data = applyJqFilter(data as Record<string, unknown>[], jq);
  }

  return JSON.stringify(data, null, 2);
}

function applyJqFilter(data: Record<string, unknown>[], expr: string): unknown {
  const trimmed = expr.trim();

  if (trimmed === ".") return data;

  const arrayAccessMatch = trimmed.match(/^\.\[\]\.(\w+)$/);
  if (arrayAccessMatch) {
    const key = arrayAccessMatch[1];
    return data.map((item) => item[key]);
  }

  const fieldMatch = trimmed.match(/^\.(\w+)$/);
  if (fieldMatch) {
    const key = fieldMatch[1];
    if (Array.isArray(data)) {
      return data.map((item) => item[key]);
    }
    return (data as Record<string, unknown>)[key];
  }

  const selectMatch = trimmed.match(
    /^\.\[\]\s*\|\s*select\(\.(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)\)$/,
  );
  if (selectMatch) {
    const [, key, op, rawValue] = selectMatch;
    const value = parseJqValue(rawValue);
    return data.filter((item) => {
      const itemVal = item[key];
      switch (op) {
        case "==":
          return itemVal === value;
        case "!=":
          return itemVal !== value;
        case ">":
          return (itemVal as number) > (value as number);
        case "<":
          return (itemVal as number) < (value as number);
        case ">=":
          return (itemVal as number) >= (value as number);
        case "<=":
          return (itemVal as number) <= (value as number);
        default:
          return true;
      }
    });
  }

  return data;
}

function parseJqValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^".*"$/.test(trimmed)) return trimmed.slice(1, -1);
  const num = Number(trimmed);
  if (!isNaN(num)) return num;
  return trimmed;
}

function formatTable<T extends Record<string, unknown>>(
  items: T[],
  columns: { key: keyof T; label: string; width?: number }[],
): string {
  if (items.length === 0) {
    return dim("No items found.");
  }

  const widths = columns.map((col) => {
    const headerLen = col.label.length;
    const maxDataLen = items.reduce((max, item) => {
      const val = String(item[col.key] ?? "");
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.min(Math.max(headerLen, maxDataLen), 50);
  });

  const header = columns
    .map((col, i) => bold(col.label.padEnd(widths[i])))
    .join("  ");

  const separator = widths.map((w) => gray("─".repeat(w))).join("  ");

  const rows = items.map((item) =>
    columns
      .map((col, i) => {
        const val = String(item[col.key] ?? "");
        return val.length > widths[i]
          ? val.slice(0, widths[i] - 1) + "…"
          : val.padEnd(widths[i]);
      })
      .join("  "),
  );

  return [header, separator, ...rows].join("\n");
}

function formatTsv<T extends Record<string, unknown>>(
  items: T[],
  columns: { key: keyof T; label: string }[],
): string {
  return items
    .map((item) =>
      columns.map((col) => String(item[col.key] ?? "")).join("\t"),
    )
    .join("\n");
}

export function formatSingle<T extends Record<string, unknown>>(
  item: T,
  fields: { key: keyof T; label: string }[],
  options: FormatOptions = {},
): string {
  if (options.json) {
    let data: unknown = item;
    if (Array.isArray(options.json) && options.json.length > 0) {
      const filtered: Record<string, unknown> = {};
      for (const field of options.json) {
        if (field in item) {
          filtered[field] = item[field];
        }
      }
      data = filtered;
    }
    return JSON.stringify(data, null, 2);
  }

  if (!isTTY) {
    return fields
      .map((f) => `${f.label}\t${String(item[f.key] ?? "")}`)
      .join("\n");
  }

  const maxLabelLen = Math.max(...fields.map((f) => f.label.length));
  return fields
    .map((f) => {
      const label = bold(f.label.padEnd(maxLabelLen));
      const value = String(item[f.key] ?? dim("—"));
      return `${label}  ${value}`;
    })
    .join("\n");
}

export function formatPrice(cents: number, symbol = "$"): string {
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  if (!isTTY) {
    return date.toISOString();
  }

  return relativeTime(date);
}

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function confirm(message: string): Promise<boolean> {
  if (!isTTY) return Promise.resolve(false);

  return new Promise((resolve) => {
    const readline = require("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    rl.question(`${message} [y/N] `, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
