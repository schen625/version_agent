import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  type: String,
  word: String,
  question: String,
  answer: String,
  translation: String,
  difficulty: String,
  approved: Boolean,
  validationReason: String,
  originalSentence: String
});

const VocabularySchema = new mongoose.Schema({
  word: String,
  translation: String,
  contextSentence: String,
  difficulty: String,
  score: Number
});

const SessionSchema = new mongoose.Schema({
  userId: String,
  mode: String,
  title: String,
  summary: String,
  vocab: [VocabularySchema],
  learnQuestions: [QuestionSchema],
  testQuestions: [QuestionSchema],
  sentences: [
    {
      sentence: String,
      translation: String,
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  },
  endedAt: Date,
  messages: [
    {
      role: String,
      original: String,
      translated: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ]
});

export default mongoose.model("Session", SessionSchema);