// Service reset đợt sale dùng chung cho CLI (npm run reset) và route admin của Phase 2 (D-09).
// BẢN KHUNG (RED): mới có chữ ký, chưa có hành vi.
import type { Redis } from "ioredis";
import type { SaleMode } from "../models/index.js";

export interface ResetResult {
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  startAt: Date;
  endAt: Date;
}

export interface ResetOptions {
  mode?: SaleMode;
}

export interface SaleAdminService {
  resetSale(saleId: string, opts?: ResetOptions): Promise<ResetResult>;
  resetAllSales(opts?: ResetOptions): Promise<ResetResult[]>;
}

export interface SaleAdminDeps {
  redis: Redis;
  onSaleReset?: (saleId: string) => void;
}

export function createSaleAdminService(_deps: SaleAdminDeps): SaleAdminService {
  return {
    async resetSale(saleId, opts = {}) {
      const now = new Date();
      return { saleId, mode: opts.mode ?? "v2", totalQty: 0, startAt: now, endAt: now };
    },
    async resetAllSales() {
      return [];
    },
  };
}
