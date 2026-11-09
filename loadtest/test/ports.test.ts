// Test đơn vị cho bộ canh cổng TIME_WAIT (RESEARCH Pattern 4, Pitfall 1): đếm socket TIME_WAIT tới cổng server
// trên cả định dạng netstat của Windows lẫn macOS, và chờ có giới hạn cho tới khi còn đủ cổng tạm thời.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PORT_BUDGET, countTimeWait, waitForPortBudget } from "../lib/ports.js";
import { InvalidError } from "../lib/types.js";

/** Output netstat giả của Windows với `n` dòng TIME_WAIT tới 127.0.0.1:5000. */
function fakeNetstat(n: number): string {
  const lines = ["Active Connections", "", "  Proto  Local Address          Foreign Address        State"];
  for (let i = 0; i < n; i++) {
    lines.push(`  TCP    127.0.0.1:${49152 + (i % 16000)}        127.0.0.1:5000         TIME_WAIT`);
  }
  return lines.join("\r\n");
}

/** Đồng hồ và hàm ngủ giả: sleep chỉ cộng thời gian, không chờ thật. */
function fakeClock() {
  let t = 1_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

const silent = (): void => {};

describe("ports.test", () => {
  describe("countTimeWait", () => {
    it("đếm dòng TIME_WAIT tới :5000 theo định dạng Windows (IPv4 và IPv6)", () => {
      const out = [
        "  TCP    127.0.0.1:52344        127.0.0.1:5000         TIME_WAIT",
        "  TCP    [::1]:52345            [::1]:5000             TIME_WAIT",
      ].join("\r\n");
      assert.equal(countTimeWait(out, 5000), 2);
    });

    it("bỏ qua dòng ESTABLISHED tới :5000 và dòng TIME_WAIT tới :50000", () => {
      const out = [
        "  TCP    127.0.0.1:52344        127.0.0.1:5000         TIME_WAIT",
        "  TCP    127.0.0.1:52346        127.0.0.1:5000         ESTABLISHED",
        "  TCP    127.0.0.1:52347        127.0.0.1:50000        TIME_WAIT",
      ].join("\r\n");
      assert.equal(countTimeWait(out, 5000), 1);
    });

    it("đếm dòng TIME_WAIT theo định dạng macOS (cổng sau dấu chấm)", () => {
      const out = [
        "Active Internet connections (including servers)",
        "Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)",
        "tcp4       0      0  127.0.0.1.52344        127.0.0.1.5000         TIME_WAIT",
        "tcp4       0      0  127.0.0.1.52345        127.0.0.1.50000        TIME_WAIT",
      ].join("\n");
      assert.equal(countTimeWait(out, 5000), 1);
    });

    it("output rỗng -> 0", () => {
      assert.equal(countTimeWait("", 5000), 0);
    });
  });

  describe("waitForPortBudget", () => {
    it("ngân sách mặc định là 10000 cổng", () => {
      assert.equal(PORT_BUDGET, 10_000);
    });

    it("chờ hai lần khi TIME_WAIT 9500 rồi 9200 rồi 100 với 1000 socket dự kiến", async () => {
      const clock = fakeClock();
      const counts = [9_500, 9_200, 100];
      let reads = 0;
      const result = await waitForPortBudget({
        port: 5000,
        planned: 1_000,
        budget: 10_000,
        pollMs: 5_000,
        maxWaitMs: 180_000,
        read: () => fakeNetstat(counts[Math.min(reads++, counts.length - 1)] as number),
        sleep: clock.sleep,
        now: clock.now,
        log: silent,
      });
      assert.deepEqual(clock.sleeps, [5_000, 5_000]);
      assert.equal(result.waitedMs, 10_000);
      assert.equal(result.timeWait, 100);
      assert.equal(result.skipped, false);
    });

    it("không chờ khi đã đủ cổng (9000 + 1000 = 10000)", async () => {
      const clock = fakeClock();
      const result = await waitForPortBudget({
        port: 5000,
        planned: 1_000,
        read: () => fakeNetstat(9_000),
        sleep: clock.sleep,
        now: clock.now,
        log: silent,
      });
      assert.deepEqual(clock.sleeps, []);
      assert.equal(result.waitedMs, 0);
      assert.equal(result.timeWait, 9_000);
      assert.equal(result.skipped, false);
    });

    it("netstat không chạy được -> skipped, không ném lỗi, không chờ", async () => {
      const clock = fakeClock();
      const result = await waitForPortBudget({
        port: 5000,
        planned: 1_000,
        read: () => null,
        sleep: clock.sleep,
        now: clock.now,
        log: silent,
      });
      assert.equal(result.skipped, true);
      assert.deepEqual(clock.sleeps, []);
    });

    it("vẫn vượt ngân sách sau maxWaitMs -> InvalidError, số lần chờ có giới hạn", async () => {
      const clock = fakeClock();
      await assert.rejects(
        waitForPortBudget({
          port: 5000,
          planned: 1_000,
          budget: 10_000,
          pollMs: 5_000,
          maxWaitMs: 180_000,
          read: () => fakeNetstat(9_999),
          sleep: clock.sleep,
          now: clock.now,
          log: silent,
        }),
        InvalidError,
      );
      assert.equal(clock.sleeps.length, 36);
    });
  });
});
