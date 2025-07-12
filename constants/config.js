const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    "https://frontend-1final-kisan-seva-lfhw.vercel.app", // ✅ Your deployed frontend
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

const CHATTU_TOKEN = "chattu-token";

export { corsOptions, CHATTU_TOKEN };
