import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  userId: String,
  role: String,
  original: String,
  translated: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Message", messageSchema);