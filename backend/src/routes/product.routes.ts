import { Router } from "express";
import { createProductController } from "../controllers/product.controller.js";
import type { CatalogService } from "../services/catalog.service.js";

/** Router /api/products: GET / ({ products }) và GET /:id ({ product }), đều công khai (SPECS §7). */
export function createProductRouter(deps: { catalog: CatalogService }): Router {
  const controller = createProductController({ catalog: deps.catalog });
  const router = Router();
  router.get("/", controller.list);
  router.get("/:id", controller.getById);
  return router;
}
