import mongoose from "mongoose";

// Per-user, per-word practice statistics. Used to compute each word's error
// rate (errors / attempts) when selecting Review words in Learn mode.
const wordStatSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  word: String,
  translation: String,
  attempts: { type: Number, default: 0 },
  errors: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

// One stat document per (user, word) pair.
wordStatSchema.index({ userId: 1, word: 1 }, { unique: true });

export default mongoose.model("WordStat", wordStatSchema);
