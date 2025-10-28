import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

/* =============================
   ENVIRONMENT VARIABLES
============================= */
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const API_URL = "https://api.bigcommerce.com";

let storeMemory = {}; // In-memory token storage (for test apps)

/* =============================
   STEP 1: INSTALL REDIRECT
============================= */
app.get("/api/install", (req, res) => {
  const { code, context, scope } = req.query;
  if (!code) return res.status(400).send("Missing code");

  const tokenUrl = `${API_URL}/oauth2/token`;

  fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code,
      scope,
      context,
    }),
  })
    .then((r) => r.json())
    .then((data) => {
      console.log("🎟️ Token response:", data);
      if (!data.access_token) return res.status(400).json({ error: "Failed to get access token", details: data });

      const storeHash = data?.context?.split("/")[1];
      storeMemory[storeHash] = data.access_token;
      console.log(`✅ Access token stored for store: ${storeHash}`);

      res.send(`
        <h2>MyRover Carrier Installed ✅</h2>
        <p>Store Hash: ${storeHash}</p>
        <p>Access Token: ${data.access_token}</p>
      `);
    })
    .catch((err) => {
      console.error("❌ Error during install:", err);
      res.status(500).json({ error: "Installation failed", details: err.message });
    });
});

/* =============================
   STEP 2: TEST CONNECTION ENDPOINT
============================= */
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ Test connection hit from BigCommerce");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // Required: must return 200 + JSON
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully",
  });
});

/* =============================
   STEP 3: GET SHIPPING RATES
============================= */
app.post("/v1/shipping/rates", (req, res) => {
  console.log("🚚 Rate request received from BigCommerce");
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const response = {
    data: [
      {
        carrier_id: 530,
        carrier_code: "myrover",
        carrier_name: "MyRover Express",
        rate_id: "MYROVER_STANDARD",
        rate_name: "MyRover Delivery (1–2 Days)",
        cost: 9.99,
        currency: "CAD",
        transit_time: "1–2 business days",
        description: "Fast local delivery via MyRover",
      },
    ],
  };

  return res.status(200).json(response);
});

/* =============================
   STEP 4: LOG REQUESTS (DEBUG)
============================= */
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.originalUrl}`);
  next();
});

/* =============================
   STEP 5: HEALTH CHECK
============================= */
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier v1 API is live and ready!");
});

/* =============================
   STEP 6: START SERVER
============================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
