// Sinh id người dùng thử nghiệm cho header x-test-user (D-08).
//
// Một id gồm 24 ký tự hex thường, ghép từ ba phần cố định độ dài:
//   - tiền tố phiên: 10 hex ngẫu nhiên, tạo một lần cho cả phiên đo;
//   - số khối: 4 hex (0000..ffff), mỗi lần gọi nextBlock()/stream() lấy một khối mới;
//   - bộ đếm: 10 hex có đệm số 0, bắt đầu từ 0 trong mỗi khối.
// Vì ba phần có độ dài cố định, hai id trùng nhau khi và chỉ khi trùng cả ba phần. Trong một phiên,
// tiền tố giống nhau, mỗi khối chỉ được cấp một lần và bộ đếm trong khối chỉ tăng, nên id không bao giờ
// lặp lại trong phiên. Điều này đúng theo cách dựng, không dựa vào xác suất.
import { randomBytes } from "node:crypto";

const PREFIX_RE = /^[0-9a-f]{10}$/;
const TEST_USER_ID_RE = /^[0-9a-f]{24}$/;
const MAX_BLOCK = 0xffff;
const MAX_COUNTER = 0xff_ffff_ffff;

export interface IdFactory {
  /** Tiền tố 10 hex của phiên. */
  readonly prefix: string;
  /** Lấy một khối mới và trả về `count` id liên tiếp của khối đó. */
  nextBlock(count: number): string[];
  /** Lấy một khối mới và trả về hàm sinh id tiếp theo trong khối (dùng cho autocannon). */
  stream(): () => string;
}

export function createIdFactory(prefixHex?: string): IdFactory {
  const prefix = prefixHex ?? randomBytes(5).toString("hex");
  if (!PREFIX_RE.test(prefix)) {
    throw new Error(`Tiền tố id phải gồm đúng 10 ký tự hex thường, nhận "${prefix}"`);
  }
  let nextBlockNo = 0;

  function takeBlock(): string {
    if (nextBlockNo > MAX_BLOCK) {
      throw new Error("Đã dùng hết 65536 khối id của phiên này, hãy bắt đầu phiên mới");
    }
    const block = nextBlockNo.toString(16).padStart(4, "0");
    nextBlockNo += 1;
    return prefix + block;
  }

  function makeId(head: string, counter: number): string {
    if (counter > MAX_COUNTER) {
      throw new Error("Bộ đếm id trong khối đã vượt quá ffffffffff");
    }
    return head + counter.toString(16).padStart(10, "0");
  }

  return {
    prefix,
    nextBlock(count: number): string[] {
      if (!Number.isSafeInteger(count) || count < 0 || count > MAX_COUNTER + 1) {
        throw new Error(`Số id cần sinh không hợp lệ: ${count}`);
      }
      const head = takeBlock();
      const ids = new Array<string>(count);
      for (let i = 0; i < count; i++) ids[i] = makeId(head, i);
      return ids;
    },
    stream(): () => string {
      const head = takeBlock();
      let counter = 0;
      return () => makeId(head, counter++);
    },
  };
}

/** Số id khác nhau (mỗi kịch bản so sánh với số request dự kiến trước khi bắn). */
export function countDistinct(ids: Iterable<string>): number {
  return new Set(ids).size;
}

/** Đúng định dạng id thử nghiệm: 24 ký tự hex thường. */
export function isTestUserId(id: string): boolean {
  return TEST_USER_ID_RE.test(id);
}
