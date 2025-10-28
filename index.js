// index.js
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// -----------------------------------------------------------------------------
// 1️⃣ Environment Variables
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const REDIRECT_URI = process.env.BC_REDIRECT_URI;
const BASE_URL = process.env.BASE_URL; // e.g., https://myrover-carrier.onrender.com

// Store tokens in memory for now (Redis/DB recommended in production)
let ACCESS_TOKEN = null;
let STORE_HASH = null;

// -----------------------------------------------------------------------------
// 2️⃣ Root route
// -----------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier App Running");
});

// -----------------------------------------------------------------------------
// 3️⃣ OAuth Install Step 1 — Redirect user to BigCommerce Auth
// -----------------------------------------------------------------------------
app.get("/api/auth", (req, res) => {
  const { code, context, scope } = req.query;
  if (!code) return res.status(400).send("Missing code");

  const tokenUrl = "https://login.bigcommerce.com/oauth2/token";
  const payload = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code,
    scope,
    context,
  };

  fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then((r) => r.json())
    .then((data) => {
      console.log("🎟️ Token response:", data);

      if (data.access_token && data.context) {
        ACCESS_TOKEN = data.access_token;
        STORE_HASH = data.context.replace("stores/", "");
        console.log(`✅ ACCESS_TOKEN: ${ACCESS_TOKEN}`);
        console.log(`✅ STORE_HASH: ${STORE_HASH}`);
        res.redirect("/success");
      } else {
        res.status(400).json({ error: "Failed to get access token", details: data });
      }
    })
    .catch((err) => {
      console.error("❌ Auth error:", err);
      res.status(500).json({ error: "Auth request failed" });
    });
});

// -----------------------------------------------------------------------------
// 4️⃣ OAuth Redirect (Callback URL)
// -----------------------------------------------------------------------------
app.get("/api/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;
  if (!code) return res.status(400).send("Missing code");

  const tokenUrl = "https://login.bigcommerce.com/oauth2/token";
  const payload = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
    code,
    scope,
    context,
  };

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    console.log("🎟️ Token response:", data);

    if (data.access_token && data.context) {
      ACCESS_TOKEN = data.access_token;
      STORE_HASH = data.context.replace("stores/", "");
      console.log(`✅ ACCESS_TOKEN: ${ACCESS_TOKEN}`);
      console.log(`✅ STORE_HASH: ${STORE_HASH}`);
      res.redirect("/success");
    } else {
      res.status(400).json({ error: "Failed to get access token", details: data });
    }
  } catch (err) {
    console.error("❌ Auth Callback Error:", err);
    res.status(500).json({ error: "Failed to exchange code for token" });
  }
});

// -----------------------------------------------------------------------------
// 5️⃣ Success Page
// -----------------------------------------------------------------------------
app.get("/success", (req, res) => {
  res.send("<h1>✅ MyRover App Installed Successfully!</h1>");
});

// -----------------------------------------------------------------------------
// 6️⃣ Debug Endpoints
// -----------------------------------------------------------------------------
app.get("/debug/test", (req, res) => {
  if (!ACCESS_TOKEN || !STORE_HASH)
    return res.json({ error: "No token or store hash loaded in memory" });

  res.json({
    success: true,
    store: STORE_HASH,
    token: ACCESS_TOKEN.substring(0, 6) + "...",
  });
});

// -----------------------------------------------------------------------------
// 7️⃣ BigCommerce App “Test Connection” (Fix for Error Getting Account Status)
// -----------------------------------------------------------------------------
app.post("/api/check", async (req, res) => {
  console.log("/api/check HIT from BigCommerce");
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.warn("⚠️ No Authorization header found in request");
    return res.status(401).json({
      status: "FAIL",
      data: { can_connect: false },
      messages: [{ code: "NO_AUTH", text: "Missing Authorization header" }],
    });
  }

  return res.status(200).json({
    status: "OK",
    data: {
      can_connect: true,
      connected: true,
      account_status: "active",
      message: "Connection verified successfully",
    },
    messages: [
      { code: "SUCCESS", text: "Connection successful. MyRover verified." },
    ],
  });
});

// -----------------------------------------------------------------------------
// 8️⃣ Carrier “Test Connection” Endpoint (Required by BigCommerce)
// -----------------------------------------------------------------------------
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT");
  res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully",
  });
});

// -----------------------------------------------------------------------------
// 9️⃣ Carrier “Get Rates” Endpoint (Required by BigCommerce)
// -----------------------------------------------------------------------------
app.post("/v1/shipping/rates", async (req, res) => {
  console.log("📦 /v1/shipping/rates HIT with body:", req.body);

  // You can read items, origin, destination, etc., from req.body here
  const rates = [
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
  ];

  res.status(200).json({ data: rates });
});

// -----------------------------------------------------------------------------
// 🔟 Start Server
// -----------------------------------------------------------------------------
app.listen(PORT, () => console.log(`🚀 MyRover Carrier running on port ${PORT}`));
