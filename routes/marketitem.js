import express from "express";
import {
  addMarketItem,
  getMyMarketItems,
  getAllMarketItems,
  deleteMyMarketItem,
} from "../controllers/marketitem.js";
import { isAuthenticated } from "../middlewares/auth.js";

const router = express.Router();

router.get("/all", isAuthenticated, getAllMarketItems);
router.get("/", isAuthenticated, getMyMarketItems);
router.post("/", isAuthenticated, addMarketItem);
router.delete("/:id", isAuthenticated, deleteMyMarketItem);

export default router;
