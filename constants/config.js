const corsOptions = {
  origin: [
    "http://localhost:5173", // local dev
    "http://localhost:4173",
    "https://frontend-1final-kisan-seva-lfhw.vercel.app", // ✅ add this
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};


const CHATTU_TOKEN = "chattu-token";

export { corsOptions, CHATTU_TOKEN };
