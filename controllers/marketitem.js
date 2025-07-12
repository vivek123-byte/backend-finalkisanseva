import { TryCatch } from "../middlewares/error.js";
import { MarketItem } from "../models/marketitem.js";
import { ErrorHandler } from "../utils/utility.js";

const addMarketItem = TryCatch(async (req, res, next) => {
  console.log("POST /api/v1/market-items called", req.body, req.user);
  const { crop, quantity, price } = req.body;

  if (!crop || !quantity || !price) {
    return next(new ErrorHandler("All fields are required", 400));
  }

  const marketItem = await MarketItem.create({
    userId: req.user,
    crop,
    quantity: parseInt(quantity),
    price: parseInt(price),
  });

  res.status(201).json({
    success: true,
    message: "Market item added",
    marketItem,
  });
});

const getMyMarketItems = TryCatch(async (req, res, next) => {
  console.log("GET /api/v1/market-items called", req.user);
  const marketItems = await MarketItem.find({ userId: req.user });

  res.status(200).json({
    success: true,
    marketItems,
  });
});

const getAllMarketItems = TryCatch(async (req, res, next) => {
  console.log("GET /api/v1/market-items called", req.user);
  const marketItems = await MarketItem.find().populate(
    "userId",
    "username name"
  );
  res.status(200).json({
    success: true,
    marketItems,
  });
});
const deleteMyMarketItem = TryCatch(async (req, res, next) => {
  console.log(
    "DELETE /api/v1/market-items/:id called",
    req.params.id,
    req.user
  );
  const marketItem = await MarketItem.findById(req.params.id);

  if (!marketItem) {
    return next(new ErrorHandler("Market item not found", 404));
  }

  if (marketItem.userId.toString() !== req.user) {
    return next(new ErrorHandler("Unauthorized action", 403));
  }

  await marketItem.deleteOne();

  res.status(200).json({
    success: true,
    message: "Market item deleted successfully",
  });
});

export {
  addMarketItem,
  getMyMarketItems,
  getAllMarketItems,
  deleteMyMarketItem,
};
