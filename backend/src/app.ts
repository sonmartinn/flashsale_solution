import cors from "cors";
import express from "express";
import { config } from "./config/index.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import { router } from "./routes/index.js";

export const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

app.use("/api", router);

app.use(notFound);
app.use(errorHandler);
