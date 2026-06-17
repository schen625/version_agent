import mongoose from "mongoose";

const UserWordStatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  word: { type: String, required: true, index: true },

  correct: { type: Number, default: 0 },
  wrong: { type: Number, default: 0 },

  lastSeen: { type: Date, default: Date.now }
});

UserWordStatSchema.index({ userId: 1, word: 1 }, { unique: true });

export default mongoose.model("UserWordStat", UserWordStatSchema);