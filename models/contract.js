import mongoose from "mongoose";

const contractSchema = new mongoose.Schema({
  contractNumber: { type: String, required: true, unique: true },
  buyerId: { type: String, required: true },
  farmerId: { type: String, required: true },
  marketItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MarketItem" },
  crop: { type: String, required: true },
  price: { type: Number, required: true },
  agreementDate: { type: Date, required: true },
  deliveryDate: { type: Date, required: true },
  terms: { type: String, required: true },
  buyerSignature: { type: String, required: true },
  farmerSignature: { type: String },
  paymentId: { type: String },
  paymentDeadline: { type: Date },
  status: {
    type: String,
    enum: ["PENDING_FARMER", "AWAITING_PAYMENT", "COMPLETED", "DISMISSED"],
    default: "PENDING_FARMER",
  },
});

export const Contract = mongoose.model("Contract", contractSchema);
