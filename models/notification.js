import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contract",
  },
  read: {
    type: Boolean,
    default: false,
  },
  role: {
    // New field
    type: String,
    enum: ["farmer", "buyer"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Notification = mongoose.model("Notification", notificationSchema);
