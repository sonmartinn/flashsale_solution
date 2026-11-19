// Khung chung của một phiên đo (E1, E3, E2...): preflight, thông tin môi trường, bộ ghi CSV, JSON thô,
// reset có kiểm tra trước mỗi lượt, khôi phục đợt sale khi kết thúc và mã thoát (D-02 tới D-16).
//
// Harness KHÔNG khởi động hay dừng backend (D-02): người chạy mở `npm run start:test` ở terminal khác.
import { createAdminClient, type AdminClient } from "./admin.js";
import { ConfigError, type CommonConfig } from "./config.js";
import { createCsvWriter, resultPath, writeRawJson, type CsvWriter } from "./csv.js";
import { collectEnvInfo, newSessionId, type EnvInfo } from "./env-info.js";
import { createIdFactory, type IdFactory } from "./ids.js";
import { checkHealth, checkPreRun, checkSaleIndex, resolveSaleId } from "./preflight.js";
import { InvalidError, type RunStatus, type SaleMode, type StatsSnapshot } from "./types.js";
import { exitCodeFor } from "./verdict.js";

export interface Session {
  /** Tên thí nghiệm: "e1", "e3"... (dùng trong tên file) */
  name: string;
  /** Mã phiên đo, ví dụ 20261109T103000Z-ab12 */
  id: string;
  cfg: CommonConfig;
  admin: AdminClient;
  saleId: string;
  env: EnvInfo;
  /** mode và totalQty của đợt sale lúc bắt đầu phiên, để khôi phục khi kết thúc (D-04) */
  original: { mode: SaleMode; totalQty: number };
  csv: CsvWriter;
  ids: IdFactory;
  /** Cổng của server, để bộ canh cổng TIME_WAIT đếm đúng socket */
  port: number;
  /** Ghi JSON thô của phiên vào results/raw/<id>-<name>-<suffix>.json */
  raw(suffix: string, data: unknown): string;
  /** Reset đợt sale về { mode, totalQty }, đọc stats và kiểm tra bước 4 của D-06; sai thì InvalidError. */
  resetAndCheck(mode: SaleMode, totalQty: number): Promise<StatsSnapshot>;
}

/** Cổng của base URL (mặc định 80/443 theo giao thức khi URL không ghi cổng). */
function portOf(baseUrl: string): number {
  const url = new URL(baseUrl);
  if (url.port !== "") return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

/**
 * Mở phiên: preflight bước 1-3 của D-06, ghi nhớ trạng thái gốc của đợt sale rồi mới tạo file CSV,
 * nên một preflight thất bại không bao giờ ghi đè CSV của phiên trước.
 */
export async function openSession(name: string, cfg: CommonConfig, columns: readonly string[]): Promise<Session> {
  const admin = createAdminClient(cfg.baseUrl);
  const health = await admin.health();
  checkHealth(health);
  await admin.login(cfg.adminEmail, cfg.adminPassword);
  const saleId = await resolveSaleId(admin, cfg.saleId);
  const initial = await admin.stats(saleId);
  checkSaleIndex(initial);
  const original = { mode: initial.mode, totalQty: initial.totalQty };

  // Git được đọc một lần ở đây; mọi dòng CSV của phiên dùng chung thông tin này
  const env = collectEnvInfo({ session: newSessionId(), maxPoolSize: health.maxPoolSize });
  const csv = createCsvWriter(resultPath(`${name}.csv`), columns);
  const id = env.session;

  console.log(
    `Phiên ${id}: đợt sale ${saleId}, maxPoolSize ${health.maxPoolSize ?? "không rõ"}, ` +
      `commit ${env.gitCommit === "" ? "không rõ" : env.gitCommit}. Ghi kết quả vào ${csv.path}`,
  );

  return {
    name,
    id,
    cfg,
    admin,
    saleId,
    env,
    original,
    csv,
    ids: createIdFactory(),
    port: portOf(cfg.baseUrl),
    raw(suffix: string, data: unknown): string {
      return writeRawJson(`${id}-${name}-${suffix}.json`, data);
    },
    async resetAndCheck(mode: SaleMode, totalQty: number): Promise<StatsSnapshot> {
      await admin.reset(saleId, { mode, totalQty });
      const stats = await admin.stats(saleId);
      const reasons = checkPreRun(stats, { mode, totalQty });
      if (reasons.length > 0) {
        throw new InvalidError(`Dữ liệu ngay sau reset sai: ${reasons.join("; ")}`);
      }
      return stats;
    },
  };
}

/** Khôi phục đợt sale về mode và totalQty ban đầu (D-04). Không ném lỗi: thất bại chỉ in cảnh báo. */
export async function closeSession(s: Session): Promise<void> {
  try {
    const restored = await s.admin.reset(s.saleId, s.original);
    console.log(`Đã khôi phục đợt sale ${s.saleId}: mode=${restored.mode}, totalQty=${restored.totalQty}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[CẢNH BÁO] Không khôi phục được đợt sale ${s.saleId} về mode=${s.original.mode}, ` +
        `totalQty=${s.original.totalQty}: ${message}`,
    );
  }
}

/**
 * Chạy thân một thí nghiệm và đặt mã thoát: 0 PASS/VALID, 1 FAIL, 2 INVALID hoặc lỗi (D-16).
 * Dùng process.exitCode, không gọi process.exit, để các khối finally (khôi phục sale) luôn chạy xong.
 */
export async function runExperiment(
  name: string,
  usage: string,
  main: () => Promise<RunStatus | "VALID">,
): Promise<void> {
  const label = name.toUpperCase();
  try {
    const verdict = await main();
    process.exitCode = exitCodeFor(verdict);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[LỖI] ${err.message}`);
      console.error(usage);
    } else if (err instanceof InvalidError) {
      console.error(`[LỖI] INVALID: ${err.message}`);
      console.log(`KẾT LUẬN ${label}: INVALID — môi trường đo không đáng tin, không có kết luận`);
    } else {
      console.error(`[LỖI] ${err instanceof Error ? err.message : String(err)}`);
      console.log(`KẾT LUẬN ${label}: INVALID — thí nghiệm dừng vì lỗi bất ngờ`);
    }
    process.exitCode = 2;
  }
}
