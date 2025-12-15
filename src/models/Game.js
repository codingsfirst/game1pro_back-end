import mongoose from "mongoose";

const GameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tag: { type: String, default: "Live Game" },
    image: { type: String, default: "" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Game = mongoose.model("Game", GameSchema);
