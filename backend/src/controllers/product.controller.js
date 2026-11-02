import { Product } from "../models/Product.js";
import { HttpError } from "../middlewares/error.js";

export async function listProducts(req, res) {
  const products = await Product.find().sort({ createdAt: -1 });
  res.json(products);
}

export async function getProduct(req, res) {
  const product = await Product.findById(req.params.id);
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm");
  res.json(product);
}
