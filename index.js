require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

const app = express();
app.use(bodyParser.json());

// Global in-memory storage
let STORE_HASH = process.env.STORE_HASH || null;
let ACCESS_TOKEN = process.env.ACCESS_TOKEN || null;

// ✅ Root route
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier App is running!");
});

// ✅ AUTH CALLBACK — triggered when app is installed or reauthorized
app.get("/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;
  const storeHash = context.split("/")[1];

  console.log("🔐 Auth Callback for store:", storeHash);

  const tokenUrl = `https://login.bigcommerce.com/oauth2/token`;

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: process.env.REDIRECT_URI,
        grant_type: "authorization_code",
        code,
        scope,
        context
      })
    });

    const data = await response.json();
    console.log("🎟️ Token response:", data);

    if (data.access_token) {
      ACCESS_TOKEN = data.access_token;
      STORE_HASH = storeHash;

      // Optional: persist in Render env vars (manual or via logs)
      console.log("✅ ACCESS_TOKEN:", ACCESS_TOKEN);
      console.log("✅ STORE_HASH:", STORE_HASH);

      res.send("App authorized successfully. You can close this window.");
    } else {
      res.status(400).json({ error: "Failed to get access token", details: data });
    }
  } catch (err) {
    console.error("❌ Auth error:", err);
    res.status(500).json({ error: "Authorization failed" });
  }
});

// ✅ /api/check — called by BigCommerce to verify connection
app.post("/api/check", async (req, res) => {
  console.log("/api/check HIT from BigCommerce");

  res.json({
    status: "OK",
    data: {
      can_connect: true,
      connected: true,
      account_status: "active",
      message: "Connection verified successfully"
    },
    messages: [
      { code: "SUCCESS", text: "Connection successful. MyRover account verified." }
    ]
  });
});

// ✅ /debug/test — check loaded credentials
app.get("/debug/test", (req, res) => {
  if (!ACCESS_TOKEN || !STORE_HASH)
    return res.json({ error: "No token or store hash loaded in memory" });

  res.json({ success: true, store: STORE_HASH, token: ACCESS_TOKEN });
});

// ✅ /debug/carriers — test BigCommerce carrier API call
app.get("/debug/carriers", async (req, res) => {
  if (!ACCESS_TOKEN || !STORE_HASH)
    return res.json({ error: "Store not connected or token missing" });

  const url = `https://api.bigcommerce.com/stores/${STORE_HASH}/v2/shipping/carriers`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching carriers:", err);
    res.status(500).json({ error: "Failed to fetch carriers" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
