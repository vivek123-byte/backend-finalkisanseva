const corsOptions = {
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    "https://agro-contract.vercel.app", // <-- updated to your real frontend URL
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

const CHATTU_TOKEN = "chattu-token";

export { corsOptions, CHATTU_TOKEN };