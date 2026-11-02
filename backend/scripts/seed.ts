// Xóa sạch dữ liệu rồi tạo lại dữ liệu mẫu. Chỉ dùng cho máy phát triển.
import bcrypt from "bcryptjs";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { redis } from "../src/config/redis.js";
import { FlashSale } from "../src/models/FlashSale.js";
import { Order } from "../src/models/Order.js";
import { Product } from "../src/models/Product.js";
import { StockMovement } from "../src/models/StockMovement.js";
import { User } from "../src/models/User.js";
import { resetSale, SALE_DURATION_MS } from "../src/services/sale.service.js";

const USER_COUNT = 1000;
const SALE_QTY = 100;
const SEED_PASSWORD = "flashsale-test";

const products = [
  {
    name: "Áo thun cotton basic",
    slug: "ao-thun-cotton-basic",
    category: "ao",
    price: 199000,
    attributes: { size: ["S", "M", "L", "XL"], color: ["trắng", "đen"], material: "cotton" },
  },
  {
    name: "Áo sơ mi linen",
    slug: "ao-so-mi-linen",
    category: "ao",
    price: 459000,
    attributes: { size: ["M", "L"], color: ["be", "xanh nhạt"], material: "linen", fit: "regular" },
  },
  {
    name: "Quần jeans slim",
    slug: "quan-jeans-slim",
    category: "quan",
    price: 549000,
    attributes: { waist: [29, 30, 31, 32], color: ["xanh đậm"], stretch: true },
  },
  {
    name: "Váy midi hoa",
    slug: "vay-midi-hoa",
    category: "vay",
    price: 629000,
    attributes: { size: ["S", "M"], length: "midi", pattern: "hoa" },
  },
  {
    name: "Giày sneaker trắng",
    slug: "giay-sneaker-trang",
    category: "giay",
    price: 899000,
    attributes: { footSize: [39, 40, 41, 42, 43], sole: "cao su" },
  },
  {
    name: "Túi tote canvas",
    slug: "tui-tote-canvas",
    category: "phu-kien",
    price: 149000,
    attributes: { capacityLiters: 12, color: ["kem"] },
  },
];

await connectDb();
await redis.connect();

await Promise.all([
  User.deleteMany({}),
  Product.deleteMany({}),
  FlashSale.deleteMany({}),
  Order.deleteMany({}),
  StockMovement.deleteMany({}),
]);
await redis.flushdb();

// Băm một lần vì bcrypt chậm, các tài khoản thử dùng chung mật khẩu
const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
const users = [
  ...Array.from({ length: USER_COUNT }, (_, i) => {
    const no = String(i + 1).padStart(4, "0");
    return { name: `Khách ${no}`, email: `user${no}@flashsale.test`, passwordHash };
  }),
  { name: "Admin", email: "admin@flashsale.test", passwordHash, role: "admin" as const },
];
await User.insertMany(users);

const inserted = await Product.insertMany(products);
const saleProduct = inserted[0];
const now = new Date();
const sale = await FlashSale.create({
  productId: saleProduct._id,
  salePrice: Math.round(saleProduct.price / 2),
  totalQty: SALE_QTY,
  remainingQty: SALE_QTY,
  startAt: now,
  endAt: new Date(now.getTime() + SALE_DURATION_MS),
  status: "active",
});
await resetSale(sale._id);

console.log(`Đã tạo ${users.length} user, ${inserted.length} sản phẩm, 1 đợt sale ${sale._id}`);

await redis.quit();
await disconnectDb();
