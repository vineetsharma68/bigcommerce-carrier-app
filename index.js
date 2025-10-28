// index.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

// 🔐 Environment variables
const {
  BC_CLIENT_ID,
  BC_CLIENT_SECRET,
  BC_REDIRECT_URI,
  APP_URL,
  PORT = 3000,
} = process.env;

// 🔒 In-memory token store (for testing; use DB in production)
let STORE_HASH = null;
let ACCESS_TOKEN = null;

/* ==========================
   1️⃣ Root - Health Check
========================== */
app.get("/", (req, res) => {
  res.json({
    status: "MyRover Carrier App Running",
    timestamp: new Date().toISOString(),
  });
});

/* ==========================
   2️⃣ OAuth Install Redirect
========================== */
app.get("/api/install", (req, res) => {
  const { code, context, scope } = req.query;
  if (code && context) {
    return res.redirect(`/api/auth/callback?code=${code}&context=${context}`);
  }

  const installUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${BC_CLIENT_ID}&scope=store_v2_information%20store_v2_orders&redirect_uri=${encodeURIComponent(
    BC_REDIRECT_URI
  )}&response_type=code`;
  res.redirect(installUrl);
});

/* ==========================
   3️⃣ OAuth Callback
========================== */
app.get("/api/auth/callback", async (req, res) => {
  const { code, context } = req.query;

  if (!code || !context) {
    return res.status(400).json({ error: "Missing code or context" });
  }

  console.log("🔐 Auth Callback for store:", context);

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: BC_CLIENT_ID,
        client_secret: BC_CLIENT_SECRET,
        redirect_uri: BC_REDIRECT_URI,
        grant_type: "authorization_code",
        code,
        scope: "store_v2_information store_v2_orders",
        context,
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("🎟️ Token response:", tokenData);

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error });
    }

    // Save in-memory
    ACCESS_TOKEN = tokenData.access_token;
    STORE_HASH = tokenData.context.replace("stores/", "");

    console.log("✅ Access token stored for store:", STORE_HASH);

    return res.json({
      success: true,
      store: STORE_HASH,
      message: "App installed successfully!",
    });
  } catch (err) {
    console.error("❌ OAuth callback error:", err);
    res.status(500).json({ error: "OAuth callback failed" });
  }
});

/* ==========================
   4️⃣ Test Connection (Required)
========================== */
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully",
  });
});

/* ==========================
   5️⃣ Get Rates (Required)
========================== */
app.post("/v1/shipping/rates", (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  res.status(200).json({
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
  });
});

/* ==========================
   6️⃣ Debug - Check token
========================== */
app.get("/debug/test", (req, res) => {
  if (!ACCESS_TOKEN) {
    return res.json({ error: "No token loaded in memory" });
  }
  res.json({
    success: true,
    store: STORE_HASH,
    token: ACCESS_TOKEN.substring(0, 10) + "...",
  });
});

/* ==========================
   7️⃣ Start Server
========================== */
app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier App running on port ${PORT}`);
  console.log(`🔗 ${APP_URL}`);
});
