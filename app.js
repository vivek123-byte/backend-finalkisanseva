import express from "express";
import { connectDB } from "./utils/features.js";
import dotenv from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import { v4 as uuid } from "uuid";
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import {
  CHAT_JOINED,
  CHAT_LEAVED,
  NEW_MESSAGE,
  NEW_MESSAGE_ALERT,
  ONLINE_USERS,
  START_TYPING,
  STOP_TYPING,
} from "./constants/events.js";
import { getSockets } from "./lib/helper.js";
import { Message } from "./models/message.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";
import { Contract } from "./models/contract.js";

import marketItemRouter from "./routes/marketitem.js";
import userRoute from "./routes/user.js";
import chatRoute from "./routes/chat.js";
import adminRoute from "./routes/admin.js";
import contractRoute from "./routes/contractRoutes.js";

dotenv.config({
  path: "./.env",
});

const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 10000;
const envMode = process.env.NODE_ENV.trim() || "PRODUCTION";
const adminSecretKey = process.env.ADMIN_SECRET_KEY || "adsasdsdfsdfsdfd";
const userSocketIDs = new Map();
const onlineUsers = new Set();

connectDB(mongoURI);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: corsOptions,
});

app.set("io", io);

// Using Middlewares Here
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

// Routes
app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/market-items", marketItemRouter);
app.use("/api/v1/contracts", contractRoute);

app.get("/", (req, res) => {
  res.send("Hello World");
});

io.use((socket, next) => {
  cookieParser()(
    socket.request,
    socket.request.res,
    async (err) => await socketAuthenticator(err, socket, next)
  );
});

const scheduleDissolutionCheck = () => {
  const runDissolutionCheck = async () => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (isNaN(sevenDaysAgo.getTime())) {
        throw new Error("Invalid sevenDaysAgo date");
      }
      const contracts = await Contract.find({
        status: "AWAITING_PAYMENT",
        createdAt: {
          $lte: sevenDaysAgo,
          $exists: true,
          $ne: null,
          $type: "date",
        },
      }).lean();
      console.log(`Found ${contracts.length} contracts for dissolution check`);
      for (const contract of contracts) {
        const createdAt = new Date(contract.createdAt);
        if (isNaN(createdAt.getTime())) {
          console.warn(
            `Skipping contract ${contract.contractNumber} with invalid createdAt: ${contract.createdAt}`
          );
          continue;
        }
        if (!contract.contractNumber) {
          console.warn(
            `Skipping contract with missing contractNumber, ID: ${contract._id}`
          );
          continue;
        }
        await Contract.updateOne(
          { _id: contract._id },
          { $set: { status: "DISSOLVED" } }
        );
        console.log(`Contract ${contract.contractNumber} dissolved`);
      }
    } catch (err) {
      console.error("Dissolution check error:", err.message, err.stack);
    }
  };

  // Calculate time until next midnight (UTC)
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0
    )
  );
  const initialDelay = nextMidnight - now;

  // Run at next midnight, then every 24 hours
  setTimeout(() => {
    runDissolutionCheck();
    setInterval(runDissolutionCheck, 24 * 60 * 60 * 1000); // 24 hours
  }, initialDelay);
};

// Start the dissolution check
scheduleDissolutionCheck();

// Socket.IO Events
io.on("connection", (socket) => {
  const user = socket.user;
  userSocketIDs.set(user._id.toString(), socket.id);

  // Existing chat events
  socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
    const messageForRealTime = {
      content: message,
      _id: uuid(),
      sender: {
        _id: user._id,
        name: user.name,
      },
      chat: chatId,
      createdAt: new Date().toISOString(),
    };

    const messageForDB = {
      content: message,
      sender: user._id,
      chat: chatId,
    };

    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(NEW_MESSAGE, {
      chatId,
      message: messageForRealTime,
    });
    io.to(membersSocket).emit(NEW_MESSAGE_ALERT, { chatId });

    try {
      await Message.create(messageForDB);
    } catch (error) {
      throw new Error(error);
    }
  });

  socket.on(START_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(START_TYPING, { chatId });
  });

  socket.on(STOP_TYPING, ({ members, chatId }) => {
    const membersSockets = getSockets(members);
    socket.to(membersSockets).emit(STOP_TYPING, { chatId });
  });

  socket.on(CHAT_JOINED, ({ userId, members }) => {
    onlineUsers.add(userId.toString());
    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on(CHAT_LEAVED, ({ userId, members }) => {
    onlineUsers.delete(userId.toString());
    const membersSocket = getSockets(members);
    io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  socket.on("disconnect", () => {
    userSocketIDs.delete(user._id.toString());
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });
});

app.use(errorMiddleware);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port ${port} in ${envMode} Mode`);
});

export { envMode, adminSecretKey, userSocketIDs };
