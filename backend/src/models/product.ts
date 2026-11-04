import { Schema, model } from "mongoose";

// attributes là object tự do theo loại hàng (size, màu, chất liệu...): thể hiện schema linh hoạt (SPECS §6).
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    category: { type: String, required: true },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    attributes: { type: Schema.Types.Mixed, default: {} },
    description: { type: String },
  },
  { collection: "products" },
);

export const Product = model("Product", productSchema);
