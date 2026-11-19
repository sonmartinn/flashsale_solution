import assert from "node:assert/strict";
import { it } from "node:test";
import { createPollingController, type PollingEnvironment } from "../src/services/polling.ts";

async function settled() {
  await Promise.resolve();
  await Promise.resolve();
}

function fixture(initiallyVisible = true) {
  let visible = initiallyVisible;
  let listener: (() => void) | undefined;
  const timers = new Map<() => void, number>();
  const requests: { signal: AbortSignal; resolve(value: number): void; reject(error: Error): void }[] = [];
  const data: number[] = [];
  const errors: unknown[] = [];
  const environment: PollingEnvironment = {
    isVisible: () => visible,
    observeVisibility(callback) {
      listener = callback;
      return () => { listener = undefined; };
    },
    schedule(callback, delay) {
      timers.set(callback, delay);
      return () => { timers.delete(callback); };
    },
  };
  const polling = createPollingController({
    environment,
    read: signal => new Promise<number>((resolve, reject) => { requests.push({ signal, resolve, reject }); }),
    onData: value => data.push(value),
    onError: error => errors.push(error),
  });
  return {
    requests, timers, data, errors, polling,
    observed: () => listener !== undefined,
    show(value: boolean) { visible = value; listener?.(); },
    tick() {
      assert.deepEqual([...timers.values()], [2000]);
      const [run] = timers.keys();
      timers.delete(run);
      run();
    },
  };
}

it("chỉ đếm 2 giây sau khi đọc xong và làm mới gộp vào lần đọc đang chạy", async () => {
  const f = fixture();
  assert.equal(f.requests.length, 1);
  assert.equal(f.timers.size, 0);
  f.polling.refresh();
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve(100);
  await settled();
  assert.deepEqual(f.data, [100]);
  f.tick();
  assert.equal(f.requests.length, 2);
  assert.equal(f.timers.size, 0);
  f.polling.dispose();
  assert.equal(f.requests[1].signal.aborted, true);
});

it("tab ẩn không đọc, lần hiện lại chỉ đọc một lần sau khi lượt cũ đã hủy", async () => {
  const f = fixture(false);
  f.polling.refresh();
  assert.equal(f.requests.length, 0);
  f.show(true);
  f.show(true);
  assert.equal(f.requests.length, 1);
  f.show(false);
  assert.equal(f.requests[0].signal.aborted, true);
  f.show(true);
  f.show(true);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve(9);
  await settled();
  assert.deepEqual(f.data, []);
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(7);
  await settled();
  assert.deepEqual(f.data, [7]);
  f.show(false);
  assert.equal(f.timers.size, 0);
  f.polling.dispose();
  assert.equal(f.observed(), false);
});

it("đọc lại sau mua bỏ qua kết quả cũ dù lần đọc không tuân theo abort", async () => {
  const f = fixture();
  f.polling.refresh(true);
  f.polling.refresh();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve(100);
  await settled();
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(99);
  await settled();
  assert.deepEqual(f.data, [99]);
  f.polling.dispose();
});

it("lỗi đọc giữ dữ liệu cuối và chu kỳ tiếp theo có thể phục hồi", async () => {
  const f = fixture();
  f.requests[0].resolve(3);
  await settled();
  f.tick();
  const offline = new Error("Mất kết nối");
  f.requests[1].reject(offline);
  await settled();
  assert.deepEqual(f.data, [3]);
  assert.deepEqual(f.errors, [offline]);
  f.tick();
  f.requests[2].resolve(-1);
  await settled();
  assert.deepEqual(f.data, [3, -1]);
  f.polling.dispose();
});

it("rời route hoặc đổi phiên hủy lần đọc, timer và listener của vòng đời cũ", async () => {
  const previous = fixture();
  previous.polling.dispose();
  const current = fixture();
  current.requests[0].resolve(5);
  previous.requests[0].resolve(8);
  previous.show(true);
  previous.polling.refresh();
  await settled();
  assert.equal(previous.requests[0].signal.aborted, true);
  assert.equal(previous.requests.length, 1);
  assert.deepEqual(previous.data, []);
  assert.equal(previous.timers.size, 0);
  assert.equal(previous.observed(), false);
  assert.deepEqual(current.data, [5]);
  current.polling.dispose();
});

it("tạm dừng bỏ kết quả đang đọc và cho phép một lần đọc do người dùng yêu cầu", async () => {
  const f = fixture();
  f.polling.setPaused(true);
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve(10);
  await settled();
  assert.deepEqual(f.data, []);
  assert.equal(f.timers.size, 0);
  f.polling.refresh();
  f.requests[1].resolve(8);
  await settled();
  assert.equal(f.timers.size, 0);
  f.polling.setPaused(false);
  assert.equal(f.requests.length, 3);
  f.requests[2].resolve(7);
  await settled();
  assert.deepEqual(f.data, [8, 7]);
  assert.equal(f.timers.size, 1);
  f.polling.dispose();
});
