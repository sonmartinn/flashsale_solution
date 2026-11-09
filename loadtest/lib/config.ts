// Khung tạm cho bước RED: chữ ký đúng, chưa có hành vi.
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
export interface CommonConfig {
  baseUrl: string;
  saleId: string | null;
  runs: number;
  adminEmail: string;
  adminPassword: string;
}
export interface E1Config extends CommonConfig {
  users: number;
  stock: number;
  nonDefault: boolean;
}
export type E3Config = CommonConfig;
export type EnvSource = Readonly<Record<string, string | undefined>>;
export const E1_DEFAULTS = { runs: 0, users: 0, stock: 0 } as const;
export const E3_STOCK = 0;
export const E3_REQUESTS = 0;
export const E1_USAGE = "";
export const E3_USAGE = "";
export function parseE1Args(_argv: string[], _env: EnvSource): E1Config {
  throw new Error("chưa cài đặt");
}
export function parseE3Args(_argv: string[], _env: EnvSource): E3Config {
  throw new Error("chưa cài đặt");
}
