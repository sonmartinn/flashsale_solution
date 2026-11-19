import type { RequestHandler } from "express";
import type { CatalogService } from "../services/catalog.service.js";

/** Handler đọc sản phẩm (công khai). Express 5 tự chuyển lỗi async tới middleware lỗi, không cần try/catch. */
export function createProductController(deps: { catalog: CatalogService }): {
  list: RequestHandler;
  getById: RequestHandler;
} {
  const { catalog } = deps;
  const list: RequestHandler = async (_req, res) => {
    res.json({ products: await catalog.listProducts() });
  };
  const getById: RequestHandler = async (req, res) => {
    res.json({ product: await catalog.getProduct(req.params["id"]) });
  };
  return { list, getById };
}
