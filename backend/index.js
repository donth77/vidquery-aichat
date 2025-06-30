import express from "express";
import cors from "cors";
import { agent } from "./agent.js";
import { addYTVideoToVectorStore } from "./embeddings.js";

const port = process.env.PORT || 3000;

const app = express();

app.use(express.json({ limit: "200mb" }));

// Configure CORS properly
const corsOptions = {
  origin: [
    "http://localhost:5173", // Local development
    "http://localhost:3000", // Local development
    "https://gray-colonial-jellyfish.app.genez.io", // deployed frontend
    /\.genez\.io$/, // Allow all genezio subdomains
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/generate", async (req, res) => {
  const { query, thread_id } = req.body;
  console.log(query, thread_id);

  const results = await agent.invoke(
    {
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    },
    { configurable: { thread_id } }
  );

  res.send(results.messages.at(-1)?.content);
});

app.post("/webhook", async (req, res) => {
  await Promise.all(
    req.body.map(async (video) => addYTVideoToVectorStore(video))
  );

  res.send("OK");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
