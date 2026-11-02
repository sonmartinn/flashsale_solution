import mongoose from "mongoose";
import { config } from "./index.js";

export async function connectDb() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
