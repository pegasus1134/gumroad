import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface Config {
  token: string;
}

function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || join(homedir(), ".config");
  return join(base, "gumroad");
}

function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

export function getToken(): string | null {
  if (process.env.GUMROAD_TOKEN) {
    return process.env.GUMROAD_TOKEN;
  }

  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as Config;
    return config.token || null;
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const config: Config = { token };
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function removeToken(): boolean {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) {
    return false;
  }
  unlinkSync(configPath);
  return true;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
