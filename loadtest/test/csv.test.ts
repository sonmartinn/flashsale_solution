// Test đơn vị cho bộ ghi CSV (D-11, D-12, D-18, D-20), gồm một ca ghi file thật ra đĩa.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  E1_COLUMNS,
  E3_COLUMNS,
  ENV_COLUMNS,
  createCsvWriter,
  formatCell,
  formatRow,
  type CsvValue,
} from "../lib/csv.js";
import { collectEnvInfo, envColumns, newSessionId } from "../lib/env-info.js";

/** Tiêu đề e1.csv đã đóng băng, viết tay để bắt mọi thay đổi vô tình (D-18). */
const E1_HEADER =
  "session,date,gitCommit,nodeVersion,os,cpuModel,cpuCount,totalMemGB,maxPoolSize," +
  "run,mode,users,totalQty,s201,s409SoldOut,s409AlreadyBought,s401,sOther4xx,s5xx,connErrors," +
  "orders,distinctUsers,finalStock,oversold,reconcile,durationMs,status,note";

/** Tiêu đề e3.csv đã đóng băng (D-20). */
const E3_HEADER =
  "session,date,gitCommit,nodeVersion,os,cpuModel,cpuCount,totalMemGB,maxPoolSize," +
  "run,mode,requests,totalQty,s201,s409SoldOut,s409AlreadyBought,sOther,realErrors,userOrders," +
  "finalStock,expectedStock,stockLeak,reconcile,status,note";

describe("csv.test", () => {
  const cases: Array<[CsvValue, string]> = [
    [12, "12"],
    [-50, "-50"],
    [0, "0"],
    [12.345, "12.35"],
    [15.999, "16.00"],
    [NaN, ""],
    [Infinity, ""],
    [null, ""],
    [undefined, ""],
    [true, "true"],
    [false, "false"],
    ["v1", "v1"],
    ["", ""],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["dòng 1\ndòng 2", '"dòng 1\ndòng 2"'],
    ["a\rb", '"a\rb"'],
    ["=1+1", "'=1+1"],
    ["+1", "'+1"],
    ["-x", "'-x"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["=a,b", `"'=a,b"`],
  ];
  for (const [input, expected] of cases) {
    it(`formatCell(${JSON.stringify(input) ?? String(input)}) -> ${JSON.stringify(expected)}`, () => {
      assert.equal(formatCell(input), expected);
    });
  }

  it("formatRow ghép ô theo thứ tự cột", () => {
    assert.equal(formatRow(["a", "b", "c"], { c: 3, a: "x", b: null }), "x,,3");
  });

  it("formatRow ném lỗi khi có cột lạ", () => {
    assert.throws(() => formatRow(["a"], { a: 1, typo: 2 }), /cột lạ "typo"/);
  });

  it("formatRow ném lỗi khi thiếu cột", () => {
    assert.throws(() => formatRow(["a", "b"], { a: 1 }), /thiếu cột "b"/);
  });

  it("tiêu đề E1 và E3 khớp đúng chuỗi đã đóng băng", () => {
    assert.equal(E1_COLUMNS.join(","), E1_HEADER);
    assert.equal(E3_COLUMNS.join(","), E3_HEADER);
    assert.deepEqual(E1_COLUMNS.slice(0, ENV_COLUMNS.length), [...ENV_COLUMNS]);
    assert.deepEqual(E3_COLUMNS.slice(0, ENV_COLUMNS.length), [...ENV_COLUMNS]);
  });

  describe("ghi file e1.csv thật ra đĩa", () => {
    let dir = "";
    before(async () => {
      dir = await mkdtemp(path.join(os.tmpdir(), "flashsale-csv-"));
    });
    after(async () => {
      if (dir !== "") await rm(dir, { recursive: true, force: true });
    });

    it("UTF-8 không BOM, LF, một dòng tiêu đề và mỗi lần append thêm đúng một dòng", async () => {
      const filePath = path.join(dir, "e1.csv");
      const session = newSessionId();
      const env = collectEnvInfo({ session, maxPoolSize: 100 });
      const writer = createCsvWriter(filePath, E1_COLUMNS);
      assert.equal(writer.path, filePath);

      writer.append({
        ...envColumns(env),
        run: 1,
        mode: "v0",
        users: 1000,
        totalQty: 100,
        s201: 150,
        s409SoldOut: 850,
        s409AlreadyBought: 0,
        s401: 0,
        sOther4xx: 0,
        s5xx: 0,
        connErrors: 0,
        orders: 150,
        distinctUsers: 150,
        finalStock: -50,
        oversold: 50,
        reconcile: "n/a",
        durationMs: 812.456,
        status: "PASS",
        note: "V0 bán quá, đúng kỳ vọng",
      });
      writer.append({
        ...envColumns(env),
        run: 2,
        mode: "v1",
        users: 1000,
        totalQty: 100,
        s201: 100,
        s409SoldOut: 900,
        s409AlreadyBought: 0,
        s401: 0,
        sOther4xx: 0,
        s5xx: 0,
        connErrors: 0,
        orders: 100,
        distinctUsers: 100,
        finalStock: 0,
        oversold: 0,
        reconcile: "n/a",
        durationMs: 640,
        status: "PASS",
        note: "",
      });

      const bytes = await readFile(filePath);
      assert.notEqual(bytes[0], 0xef, "file không được bắt đầu bằng BOM");
      const text = bytes.toString("utf8");
      assert.equal(text.includes("\r"), false, "chỉ dùng LF");
      assert.ok(text.endsWith("\n"));
      const lines = text.split("\n");
      assert.equal(lines.at(-1), "");
      const rows = lines.slice(0, -1);
      assert.equal(rows.length, 3);
      assert.equal(rows[0], E1_HEADER);
      assert.ok(rows[1]?.startsWith(`${session},`));
      assert.ok(rows[1]?.includes(",v0,1000,100,150,850,0,0,0,0,0,150,150,-50,50,n/a,812.46,PASS,"));
      assert.ok(rows[1]?.endsWith(',"V0 bán quá, đúng kỳ vọng"'));
      assert.ok(rows[2]?.endsWith(",100,100,0,0,n/a,640,PASS,"));
      assert.ok(rows[2]?.includes(",100,"), "maxPoolSize được ghi");

      // Tạo lại bộ ghi trên cùng đường dẫn: file bị ghi đè, chỉ còn dòng tiêu đề
      createCsvWriter(filePath, E1_COLUMNS);
      assert.equal(await readFile(filePath, "utf8"), `${E1_HEADER}\n`);
    });

    it("tạo thư mục cha khi chưa có", async () => {
      const filePath = path.join(dir, "con", "chau", "e3.csv");
      createCsvWriter(filePath, E3_COLUMNS);
      assert.equal(await readFile(filePath, "utf8"), `${E3_HEADER}\n`);
    });
  });
});
