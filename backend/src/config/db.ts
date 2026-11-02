import mongoose from "mongoose";
import { config } from "./index.js";

export async function connectDb() {
  // maxPoolSize ghi tường minh để báo cáo thực nghiệm nêu được con số, không đổi giữa V1 và V2
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000, maxPoolSize: 100 });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
