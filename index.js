import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// ==========================
// 🔧 CONFIGURATION
// ==========================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || "https://myrover-carrier.onrender.com";
const PORT = process.env.PORT || 3000;

let ACCESS_TOKEN = "";
let STORE_HASH = "";

// ==========================
// 🧭 STEP 1: INSTALLATION
// ==========================
app.get("/auth/install", (req, res) => {
  const { context, scope, code } = req.query;
  console.log("🛠 Install request:", req.query);
  const redirect = `${BASE_URL}/auth/callback?code=${code}&scope=${scope}&context=${context}`;
  return res.redirect(redirect);
});

// ==========================
// 🧭 STEP 2: OAUTH CALLBACK
// ==========================
app.get("/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;
  console.log("🎯 Callback:", req.query);

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
    console.log(`✅ Access token stored for store: ${STORE_HASH}`);

    // Automatically register metadata after installation
    const metadataResponse = await registerMetadata(STORE_HASH, ACCESS_TOKEN);
    console.log("🧩 Metadata registration:", metadataResponse);

    res.send("🎉 MyRover App installed and metadata registered successfully!");
  } catch (err) {
    console.error("❌ OAuth error:", err);
    res.status(500).send("OAuth callback failed");
  }
});

// ==========================
// ⚙️ STEP 3: METADATA SETUP
// ==========================
/*async function registerMetadata(storeHash, token) {
  try {
    const metadata = {
      modules: [
        {
          type: "shipping_carrier",
          handlers: {
            connection: `${BASE_URL}/v1/shipping/connection`,
            rates: `${BASE_URL}/v1/shipping/rates`
          }
        }
      ]
    };

    const response = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`, {
      method: "POST",
      headers: {
        "X-Auth-Client": CLIENT_ID,
        "X-Auth-Token": token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(metadata)
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("❌ Metadata registration failed:", error.message);
    return { error: error.message };
  }
}
*/
// ==========================
// ✅ STEP 4: TEST CONNECTION ENDPOINT
// ==========================
app.post("/v1/shipping/connection", (req, res) => {
  console.log("✅ /v1/shipping/connection HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully"
  });
});

// ==========================
// 🚚 STEP 5: GET RATES ENDPOINT
// ==========================
app.post("/v1/shipping/rates", (req, res) => {
  console.log("📦 /v1/shipping/rates HIT from BigCommerce");
  console.log("Request Body:", JSON.stringify(req.body, null, 2));

  return res.status(200).json({
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
  });
});

// ==========================
// 🧩 STEP 6: DEBUG METADATA MANUAL SETUP
// ==========================
// ✅ Metadata registration function
async function registerMetadata(storeHash, token) {
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;

  const metadata = [
    {
      key: "shipping_connection",
      value: "/v1/shipping/connection"
    },
    {
      key: "shipping_rates",
      value: "/v1/shipping/rates"
    }
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
    throw new Error(JSON.stringify(data || { message: "Unknown error" }));
  }

  console.log("✅ Metadata registered:", data);
  return data;
}


// ==========================
// 🧠 STEP 7: /api/check (for manual tests)
// ==========================
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    data: {
      can_connect: true,
      connected: true,
      account_status: "active",
      message: "Connection verified successfully"
    },
    messages: [{ code: "SUCCESS", text: "Connection successful. MyRover account verified." }]
  });
});

// ==========================
// 🧩 STEP 8: DEBUG TEST
// ==========================
app.get("/debug/test", (req, res) => {
  if (!ACCESS_TOKEN) return res.json({ error: "No token loaded in memory" });
  return res.json({ success: true, store: STORE_HASH, token: ACCESS_TOKEN });
});

// ==========================
// 🏠 ROOT ROUTE
// ==========================
app.get("/", (req, res) => res.send("🚚 MyRover Carrier App Running and Ready!"));

// ==========================
// 🚀 START SERVER
// ==========================
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
