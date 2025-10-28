import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// 🔑 Environment Variables
const CLIENT_ID = process.env.BC_CLIENT_ID;
const CLIENT_SECRET = process.env.BC_CLIENT_SECRET;
const APP_URL = process.env.APP_URL; // e.g. https://myrover-carrier.onrender.com
const PORT = process.env.PORT || 3000;

// 🧠 In-memory store for tokens (for testing)
const storeTokens = new Map();

// 🔐 Step 1: Installation URL (OAuth Initiation)
app.get("/api/install", (req, res) => {
  const { context, scope } = req.query;
  const redirect = `https://login.bigcommerce.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=${scope}&redirect_uri=${APP_URL}/api/auth/callback&response_type=code&context=${context}`;
  res.redirect(redirect);
});

// 🔑 Step 2: OAuth Callback
app.get("/api/auth/callback", async (req, res) => {
  try {
    const { code, context, scope } = req.query;
    if (!code || !context) throw new Error("Missing code or context");

    const storeHash = context.replace("stores/", "");
    const tokenUrl = `https://login.bigcommerce.com/oauth2/token`;

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/auth/callback`,
        grant_type: "authorization_code",
        code,
        scope,
        context
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(JSON.stringify(data));

    const token = data.access_token;
    storeTokens.set(storeHash, token);

    console.log(`✅ Access token stored for store: ${storeHash}`);
    await registerMetadata(storeHash, token);

    res.send(`<h2>✅ MyRover Installed Successfully!</h2>
              <p>Store: ${storeHash}</p>`);
  } catch (err) {
    console.error("❌ OAuth callback failed:", err.message);
    res.status(400).json({ error: "OAuth callback failed", details: err.message });
  }
});

// 🚚 BigCommerce Test Connection Endpoint
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully"
  });
});

// 📦 Get Shipping Rates Endpoint
app.post("/v1/shipping/rates", async (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  try {
    const rateResponse = {
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
          description: "Fast local delivery via MyRover"
        }
      ]
    };
    res.status(200).json(rateResponse);
  } catch (err) {
    console.error("❌ Error in /rates:", err);
    res.status(500).json({ error: "Failed to fetch rates" });
  }
});

// 🧾 Register Metadata
async function registerMetadata(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;
  const metadata = [
    { key: "shipping_connection", value: "/v1/shipping/connection" },
    { key: "shipping_rates", value: "/v1/shipping/rates" }
  ];

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(metadata)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("❌ Metadata registration failed:", data);
    return data;
  }

  console.log("✅ Metadata registered:", data);
  return data;
}

// 🧩 Debug Route — Test Stored Token
app.get("/debug/test", (req, res) => {
  const storeHash = req.query.store;
  const token = storeTokens.get(storeHash);
  if (!token) return res.json({ error: "No token or store hash loaded in memory" });
  res.json({ success: true, store: storeHash, token });
});

// 🧩 Debug Route — Force Register Metadata


app.get("/v1/metadata", async (req, res) => {
  console.log("📦 /v1/metadata HIT from BigCommerce");

  try {
    const metadata = {
      meta: {
        version: "1.0",
        documentation: "https://myrover.io/docs/carrier-api",
      },
      data: {
        carrier_name: "MyRover Express",
        carrier_code: "myrover",
        description: "MyRover Carrier Integration for BigCommerce",
        supported_methods: [
          {
            type: "connection_test",
            endpoint: "/v1/shipping/connection",
            method: "POST",
          },
          {
            type: "get_rates",
            endpoint: "/v1/shipping/rates",
            method: "POST",
          }
        ],
      },
    };

    return res.status(200).json({ success: true, result: metadata });
  } catch (err) {
    console.error("❌ Metadata Error:", err);
    return res.status(500).json({
      success: false,
      message: "Metadata generation failed",
      error: err.message,
    });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier running on port ${PORT}`);
});
