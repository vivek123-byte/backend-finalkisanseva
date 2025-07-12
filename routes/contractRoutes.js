import express from "express";
import { Contract } from "../models/contract.js";
import { Notification } from "../models/notification.js";
import { User } from "../models/user.js";
import Razorpay from "razorpay";
import dotenv from "dotenv";
import crypto from "crypto";
import { isAuthenticated } from "../middlewares/auth.js";
import mongoose from "mongoose";
import { MarketItem } from "../models/marketitem.js";

dotenv.config({ path: "./.env" });

const router = express.Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Helper middleware for validating ObjectId
const validateObjectId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid ID format" });
  }
  next();
};

// Helper function to emit socket events
const emitContractEvent = (req, event, userId, data) => {
  try {
    const io = req.app.get("io");
    if (!io) {
      console.error("Socket.io instance not found");
      return;
    }

    if (!global.userSocketIDs || !(global.userSocketIDs instanceof Map)) {
      console.error("userSocketIDs not initialized");
      return;
    }

    const userSocket = global.userSocketIDs.get(userId.toString());
    if (userSocket) {
      io.to(userSocket).emit(event, data);
      console.log(`Emitted ${event} to user ${userId}`);
    } else {
      console.log(`No socket found for user ${userId}`);
    }
  } catch (error) {
    console.error("Error emitting contract event:", error);
  }
};

// Create contract
router.post("/", isAuthenticated, async (req, res) => {
  try {
    console.log("POST /contracts - Request user:", req.user);
    console.log("Request body:", req.body);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user not found",
      });
    }

    const {
      farmerUsername,
      crop,
      price,
      agreementDate,
      deliveryDate,
      terms,
      buyerSignature,
      marketItemId,
    } = req.body;

    if (
      !farmerUsername ||
      !crop ||
      !price ||
      !agreementDate ||
      !deliveryDate ||
      !terms ||
      !buyerSignature ||
      !marketItemId
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields including marketItemId are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(marketItemId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid marketItemId format",
      });
    }

    const farmer = await User.findOne({ username: farmerUsername });
    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: "Farmer not found",
      });
    }

    const generateContractNumber = () => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      return `AGR${timestamp}-${random}`;
    };

    let contract;
    let retries = 5;
    let contractNumber;

    while (retries > 0) {
      contractNumber = generateContractNumber();
      try {
        contract = new Contract({
          contractNumber,
          buyerId: req.user,
          farmerId: farmer._id.toString(),
          marketItemId,
          crop,
          price: parseFloat(price),
          agreementDate: new Date(agreementDate),
          deliveryDate: new Date(deliveryDate),
          terms,
          buyerSignature,
          status: "PENDING_FARMER",
        });
        await contract.save();
        break;
      } catch (error) {
        if (error.code === 11000 && error.keyPattern?.contractNumber) {
          retries--;
          if (retries === 0) {
            throw new Error(
              "Failed to generate unique contract number after retries"
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        } else {
          throw error;
        }
      }
    }

    const buyer = await User.findById(req.user);
    const notification = new Notification({
      userId: farmer._id.toString(),
      message: `New contract ${contractNumber} from ${
        buyer ? buyer.username : "buyer"
      }`,
      contractId: contract._id,
      role: "farmer", // Add role
    });
    await notification.save();

    emitContractEvent(req, "NEW_CONTRACT", farmer._id.toString(), {
      contractId: contract._id,
      message: notification.message,
      role: "farmer", // Add role to socket payload
    });

    res.status(201).json({
      success: true,
      contractId: contract._id,
      contractNumber,
    });
  } catch (error) {
    console.error("Create contract error:", error.message, error.stack);
    if (error.code === 11000 && error.keyPattern?.contractNumber) {
      return res.status(400).json({
        success: false,
        message: "Contract number conflict. Please try again.",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create contract",
    });
  }
});

// Get notifications
router.get("/notifications", isAuthenticated, async (req, res) => {
  try {
    console.log("GET /notifications - Request user:", req.user);
    const notifications = await Notification.find({ userId: req.user })
      .sort({ createdAt: -1 })
      .populate({
        path: "contractId",
        select: "contractNumber status crop price buyerId farmerId", // Include buyerId, farmerId
      });
    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch notifications",
    });
  }
});

// Get contract by ID
router.get("/:id", isAuthenticated, validateObjectId, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({
        success: false,
        message: "Contract not found",
      });
    }

    if (
      contract.buyerId.toString() !== req.user &&
      contract.farmerId.toString() !== req.user
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    const buyer = await User.findById(contract.buyerId);
    const farmer = await User.findById(contract.farmerId);

    res.status(200).json({
      success: true,
      contract: {
        ...contract.toObject(),
        buyerUsername: buyer ? buyer.username : "Unknown",
        farmerUsername: farmer ? farmer.username : "Unknown",
        agreementDate: contract.agreementDate.toISOString().split("T")[0],
        deliveryDate: contract.deliveryDate.toISOString().split("T")[0],
      },
    });
  } catch (error) {
    console.error("Get contract error:", error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch contract",
    });
  }
});

// Accept contract
router.patch(
  "/:id/accept",
  isAuthenticated,
  validateObjectId,
  async (req, res) => {
    try {
      const { farmerSignature } = req.body;

      if (!farmerSignature) {
        return res.status(400).json({
          success: false,
          message: "Farmer signature is required",
        });
      }

      const contract = await Contract.findById(req.params.id);
      if (!contract) {
        return res.status(404).json({
          success: false,
          message: "Contract not found",
        });
      }

      if (contract.farmerId.toString() !== req.user.toString()) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized action",
        });
      }

      if (contract.status !== "PENDING_FARMER") {
        return res.status(400).json({
          success: false,
          message: "Contract is not in pending state",
        });
      }

      // Delete associated market item
      if (contract.marketItemId) {
        const marketItem = await MarketItem.findOneAndDelete({
          _id: contract.marketItemId,
          userId: req.user,
        });

        if (!marketItem) {
          console.warn(
            `Market item ${contract.marketItemId} not found or not owned by user`
          );
        } else {
          console.log(`Deleted market item: ${contract.marketItemId}`);
        }
      }

      // Mark original farmer notification as read
      const originalNotification = await Notification.findOne({
        userId: contract.farmerId,
        contractId: contract._id,
        read: false,
      });
      if (originalNotification) {
        originalNotification.read = true;
        await originalNotification.save();
        console.log(`Marked notification ${originalNotification._id} as read`);
      }

      // Update contract
      contract.farmerSignature = farmerSignature;
      contract.status = "AWAITING_PAYMENT";
      contract.paymentDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await contract.save();

      // Create notification for buyer
      const farmer = await User.findById(req.user);
      const buyerNotification = new Notification({
        userId: contract.buyerId,
        message: `Contract ${contract.contractNumber} accepted by ${
          farmer ? farmer.username : "farmer"
        }. Please make payment.`,
        contractId: contract._id,
        role: "buyer", // Add role
      });
      await buyerNotification.save();

      // Emit socket event to buyer
      emitContractEvent(req, "CONTRACT_ACCEPTED", contract.buyerId, {
        contractId: contract._id,
        message: buyerNotification.message,
        contractStatus: contract.status,
        role: "buyer", // Add role to socket payload
      });

      res.status(200).json({
        success: true,
        message: "Contract accepted successfully",
        paymentDeadline: contract.paymentDeadline,
      });
    } catch (error) {
      console.error("Accept contract error:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to accept contract",
      });
    }
  }
);

// Initiate payment
router.post(
  "/:id/payment",
  isAuthenticated,
  validateObjectId,
  async (req, res) => {
    try {
      const contract = await Contract.findById(req.params.id);
      if (!contract) {
        return res.status(404).json({
          success: false,
          message: "Contract not found",
        });
      }

      if (contract.buyerId !== req.user) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized action",
        });
      }

      if (contract.status !== "AWAITING_PAYMENT") {
        return res.status(400).json({
          success: false,
          message: "Contract not ready for payment",
        });
      }

      const options = {
        amount: contract.price * 100, // Convert to paise
        currency: "INR",
        receipt: `contract_${contract.contractNumber}`,
      };

      const order = await razorpay.orders.create(options);

      res.status(200).json({
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          key: process.env.RAZORPAY_KEY_ID,
        },
      });
    } catch (error) {
      console.error("Payment initiation error:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to initiate payment",
      });
    }
  }
);

// Verify payment
router.post(
  "/:id/verify-payment",
  isAuthenticated,
  validateObjectId,
  async (req, res) => {
    try {
      const { orderId, paymentId, signature } = req.body;

      if (!orderId || !paymentId || !signature) {
        return res.status(400).json({
          success: false,
          message: "Order ID, payment ID, and signature are required",
        });
      }

      const contract = await Contract.findById(req.params.id);
      if (!contract) {
        return res.status(404).json({
          success: false,
          message: "Contract not found",
        });
      }

      if (contract.buyerId !== req.user) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized action",
        });
      }

      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      if (generatedSignature !== signature) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature",
        });
      }

      contract.paymentId = paymentId;
      contract.status = "COMPLETED";
      await contract.save();

      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
      });
    } catch (error) {
      console.error("Payment verification error:", error.message, error.stack);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to verify payment",
      });
    }
  }
);

// Mark notification as read
router.patch(
  "/notifications/:id/read",
  isAuthenticated,
  validateObjectId,
  async (req, res) => {
    try {
      const notification = await Notification.findById(req.params.id);
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      if (notification.userId !== req.user) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized action",
        });
      }

      notification.read = true;
      await notification.save();

      res.status(200).json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error(
        "Mark notification read error:",
        error.message,
        error.stack
      );
      res.status(500).json({
        success: false,
        message: "Failed to update notification",
      });
    }
  }
);

export default router;
