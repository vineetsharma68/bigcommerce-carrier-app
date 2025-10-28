import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// ===== CONFIG =====
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || "https://myrover-carrier.onrender.com";

let STORE_HASH = "";
let ACCESS_TOKEN = "";

// =======================
// 1️⃣ INSTALL ROUTE
// =======================
app.get("/auth/install", async (req, res) => {
  const { context, scope, code } = req.query;
  console.log("🛠 Install step:", req.query);

  if (!code || !context) return res.status(400).send("Missing code/context");
  const redirect = `${BASE_URL}/auth/callback?code=${code}&scope=${scope}&context=${context}`;
  return res.redirect(redirect);
});

// =======================
// 2️⃣ OAUTH CALLBACK
// =======================
app.get("/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;

  console.log("🔐 Auth Callback for store:", context);
  try {
    const tokenResponse = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/auth/callback`,
        grant_type: "authorization_code",
        code,
        scope,
        context,
      }),
    });

    const data = await tokenResponse.json();
    console.log("🎟️ Token response:", data);

    if (!data.access_token) {
      return res.status(400).json({ error: "Failed to get access token", details: data });
    }

    ACCESS_TOKEN = data.access_token;
    STORE_HASH = data.context.replace("stores/", "");

    console.log("✅ ACCESS_TOKEN:", ACCESS_TOKEN);
    console.log("✅ STORE_HASH:", STORE_HASH);

    res.send("🎉 MyRover installed successfully! Carrier ready to connect.");
  } catch (err) {
    console.error("❌ Auth callback error:", err.message);
    res.status(500).json({ error: "Auth callback failed", details: err.message });
  }
});

// =======================
// 3️⃣ /api/check
// =======================
app.post("/api/check", async (req, res) => {
  console.log("✅ /api/check HIT from BigCommerce");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  try {
    // BC expects strict 200 + exact structure:
    return res.status(200).json({
      data: {
        can_connect: true,
        connected: true,
        account_status: "active",
        message: "Connection verified successfully",
      },
      meta: {},
      errors: [],
    });
  } catch (error) {
    console.error("❌ /api/check error:", error);
    return res.status(500).json({
      data: { can_connect: false, connected: false },
      errors: [{ code: "SERVER_ERROR", message: error.message }],
    });
  }
});

// =======================
// 4️⃣ /rates
// =======================
app.post("/rates", async (req, res) => {
  console.log("📦 /rates HIT:", JSON.stringify(req.body, null, 2));

  // Always return rates within 10 seconds
  const rates = [
    {
      carrier_id: 530, // use your provided carrier_id
      carrier_code: "myrover",
      carrier_name: "MyRover Express",
      rate_id: "MYROVER_STANDARD",
      rate_name: "MyRover Delivery (1–2 days)",
      cost: 9.99,
      currency: "CAD",
      transit_time: "1–2 business days",
      description: "Fast GTA delivery",
    },
  ];

  res.status(200).json({ data: rates });
});

// =======================
// 5️⃣ Debug Routes
// =======================
app.get("/debug/test", (req, res) => {
  if (!ACCESS_TOKEN || !STORE_HASH) {
    return res.json({ error: "No token or store hash loaded in memory" });
  }
  res.json({ success: true, store: STORE_HASH, token: ACCESS_TOKEN });
});

app.get("/debug/carriers", async (req, res) => {
  if (!ACCESS_TOKEN || !STORE_HASH)
    return res.json({ error: "Store not connected or token missing" });

  try {
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${STORE_HASH}/v2/shipping/carriers`,
      { headers: { "X-Auth-Token": ACCESS_TOKEN, Accept: "application/json" } }
    );

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =======================
// 6️⃣ ROOT
// =======================
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier App Live!");
});

// =======================
// 🚀 START SERVER
// =======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
