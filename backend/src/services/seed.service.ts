// Dữ liệu mẫu cho flash sale thời trang (SPECS §6, 01-CONTEXT D-01..D-05, D-21).
// Service này không in gì ra màn hình: CLI scripts/seed.ts lo phần in.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import type { Redis } from "ioredis";
import { buyersKey, stockKey } from "../config/redis.js";
import { FlashSale, Product, User, ensureIndexes, type SaleMode } from "../models/index.js";

/** Mật khẩu thử dùng chung cho mọi tài khoản seed (định nghĩa DUY NHẤT ở đây, D-04). */
export const SEED_PASSWORD = "matkhau123";
export const ADMIN_EMAIL = "admin@flashsale.local";
export const ADMIN_NAME = "Quản trị viên";
export const SEED_USER_COUNT = 1000;
export const SAMPLE_USER_EMAIL = "user0001@flashsale.local";
/** Sản phẩm được đưa vào đợt sale (D-03). */
export const SALE_PRODUCT_SLUG = "giay-sneaker-trang";

const BCRYPT_COST = 10;
const SALE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SeedProduct {
  slug: string;
  name: string;
  category: string;
  price: number;
  images: string[];
  attributes: Record<string, unknown>;
  description?: string;
}

function imagePath(slug: string): string[] {
  // Đường dẫn tương đối, không dùng URL ngoài để demo chạy được khi không có mạng (D-02)
  return [`/images/products/${slug}.jpg`];
}

/**
 * 6 sản phẩm thời trang (D-01). Giá là số nguyên VND. Mỗi loại hàng có bộ khóa attributes riêng
 * để thể hiện schema linh hoạt của MongoDB.
 */
export const SEED_PRODUCTS: readonly SeedProduct[] = [
  {
    slug: "ao-thun-cotton-basic",
    name: "Áo thun cotton basic",
    category: "ao",
    price: 199_000,
    images: imagePath("ao-thun-cotton-basic"),
    attributes: { sizes: ["S", "M", "L", "XL"], colors: ["Trắng", "Đen", "Xám"], material: "Cotton 100%" },
    description: "Áo thun cổ tròn, vải cotton thoáng mát, dễ phối đồ hằng ngày.",
  },
  {
    slug: "quan-jeans-slim-fit",
    name: "Quần jeans slim fit",
    category: "quan",
    price: 499_000,
    images: imagePath("quan-jeans-slim-fit"),
    attributes: {
      waistSizes: [28, 29, 30, 31, 32, 34],
      colors: ["Xanh đậm", "Xanh nhạt"],
      material: "Denim co giãn",
      fit: "slim",
    },
    description: "Quần jeans ôm vừa, chất denim co giãn nhẹ.",
  },
  {
    slug: "vay-hoa-midi",
    name: "Váy hoa midi",
    category: "vay",
    price: 399_000,
    images: imagePath("vay-hoa-midi"),
    attributes: { sizes: ["S", "M", "L"], pattern: "hoa nhí", length: "midi", material: "Voan" },
    description: "Váy voan họa tiết hoa nhí, dài qua gối.",
  },
  {
    slug: "giay-sneaker-trang",
    name: "Giày sneaker trắng",
    category: "giay",
    price: 899_000,
    images: imagePath("giay-sneaker-trang"),
    attributes: { euSizes: [38, 39, 40, 41, 42, 43], soleMaterial: "Cao su", upperMaterial: "Da tổng hợp" },
    description: "Giày sneaker trắng đế cao su, hợp với mọi trang phục.",
  },
  {
    slug: "tui-tote-canvas",
    name: "Túi tote canvas",
    category: "tui",
    price: 249_000,
    images: imagePath("tui-tote-canvas"),
    attributes: {
      dimensionsCm: { w: 38, h: 42, d: 10 },
      capacityLiters: 15,
      material: "Canvas",
      colors: ["Be", "Đen"],
    },
    description: "Túi tote vải canvas dày, đựng vừa laptop 14 inch.",
  },
  {
    slug: "ao-khoac-gio",
    name: "Áo khoác gió chống nước",
    category: "ao-khoac",
    price: 599_000,
    images: imagePath("ao-khoac-gio"),
    attributes: { sizes: ["M", "L", "XL"], waterproof: true, hood: true, material: "Polyester" },
    description: "Áo khoác gió có mũ, chống nước nhẹ, gấp gọn được.",
  },
];

export interface SeedSummary {
  userCount: number;
  adminCount: number;
  productCount: number;
  saleCount: number;
  saleId: string;
  mode: SaleMode;
  totalQty: number;
  salePrice: number;
  productSlug: string;
  startAt: Date;
  endAt: Date;
  adminEmail: string;
  password: string;
  sampleUserEmail: string;
}

export interface SeedOptions {
  redis: Redis;
  qty: number;
  mode: SaleMode;
  now?: Date;
}

/**
 * Xóa sạch rồi tạo lại dữ liệu mẫu. Thứ tự (D-21, RESEARCH Pattern 7):
 * dropDatabase -> FLUSHDB -> ensureIndexes -> băm mật khẩu một lần -> users -> products -> sale -> nạp Redis.
 */
export async function seedDatabase({ redis, qty, mode, now = new Date() }: SeedOptions): Promise<SeedSummary> {
  if (!Number.isInteger(qty) || qty < 1) throw new Error(`qty phải là số nguyên dương (nhận ${qty})`);

  // (a) Xóa database mà URI đã chỉ định tường minh (config đã chặn URI thiếu tên database)
  await mongoose.connection.dropDatabase();
  // (b) Chỉ xóa db Redis đang chọn (FLUSHDB), không bao giờ xóa mọi db của server (D-05)
  await redis.flushdb();
  // (c) Tạo lại collection + index trước khi chèn dữ liệu
  await ensureIndexes();

  // (d) Băm mật khẩu MỘT lần cho cả 1001 tài khoản (D-04)
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_COST);

  // (e) 1 admin + 1000 user
  const users = Array.from({ length: SEED_USER_COUNT }, (_, i) => {
    const n = String(i + 1).padStart(4, "0");
    return { name: `Người dùng ${n}`, email: `user${n}@flashsale.local`, passwordHash, role: "user" as const };
  });
  await User.insertMany([{ name: ADMIN_NAME, email: ADMIN_EMAIL, passwordHash, role: "admin" as const }, ...users]);

  // (f) 6 sản phẩm
  const products = await Product.insertMany(SEED_PRODUCTS.map((p) => ({ ...p })));
  const sneaker = products.find((p) => p.slug === SALE_PRODUCT_SLUG);
  if (sneaker === undefined) throw new Error(`Không tìm thấy sản phẩm ${SALE_PRODUCT_SLUG} sau khi seed`);

  // (g) Giá sale bằng đúng nửa giá gốc, phải là số nguyên VND (D-03: 899000 / 2 = 449500)
  const salePrice = sneaker.price / 2;
  if (!Number.isInteger(salePrice)) {
    throw new Error(`Giá sale ${salePrice} không phải số nguyên (giá gốc ${sneaker.price})`);
  }

  // (h) Đợt sale đang mở 7 ngày (D-05)
  const startAt = now;
  const endAt = new Date(now.getTime() + SALE_DURATION_MS);
  const sale = await FlashSale.create({
    productId: sneaker._id,
    salePrice,
    totalQty: qty,
    remainingQty: qty,
    perUserLimit: 1,
    status: "active",
    startAt,
    endAt,
    mode,
  });
  const saleId = String(sale._id);

  // (i) Nạp kho Redis. exec() trả lỗi theo từng lệnh chứ không ném, nên phải kiểm tra từng cặp [err, res]
  const results = await redis.multi().set(stockKey(saleId), String(qty)).del(buyersKey(saleId)).exec();
  if (results === null) throw new Error("Redis multi() bị hủy");
  for (const [err] of results) {
    if (err) throw err;
  }

  // (j) Số liệu tóm tắt đếm từ dữ liệu thật, không lấy từ hằng số
  const [userCount, adminCount, productCount, saleCount] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "admin" }),
    Product.countDocuments({}),
    FlashSale.countDocuments({}),
  ]);

  return {
    userCount,
    adminCount,
    productCount,
    saleCount,
    saleId,
    mode,
    totalQty: qty,
    salePrice,
    productSlug: SALE_PRODUCT_SLUG,
    startAt,
    endAt,
    adminEmail: ADMIN_EMAIL,
    password: SEED_PASSWORD,
    sampleUserEmail: SAMPLE_USER_EMAIL,
  };
}
