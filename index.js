import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// === 🔧 CONFIGURATION ===
const CLIENT_ID = process.env.CLIENT_ID || "do8br6kf70cvh5klt4ffk7mvz3qb6rp";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "YOUR_CLIENT_SECRET_HERE";
const BASE_URL = process.env.BASE_URL || "https://myrover-carrier.onrender.com";

let STORE_HASH = "";
let ACCESS_TOKEN = "";
const CARRIER_ID = 530;

// === 1️⃣ INSTALLATION ROUTE ===
// BigCommerce calls this when the app is installed.
app.get("/auth/install", (req, res) => {
  const { context, scope, code } = req.query;
  console.log("🛠 Install request received:", req.query);

  // Redirect to callback with the code
  const redirect = `${BASE_URL}/auth/callback?code=${code}&scope=${scope}&context=${context}`;
  return res.redirect(redirect);
});

// === 2️⃣ OAUTH CALLBACK ===
// BigCommerce redirects here with a temporary code — we exchange it for an access token.
app.get("/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;
  console.log("🎯 Callback received with:", req.query);

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
    console.log("🔑 Token exchange response:", data);

    if (!data.access_token) {
      return res.status(400).send("❌ Failed to get access token. Check logs.");
    }

    ACCESS_TOKEN = data.access_token;
    STORE_HASH = data.context.replace("stores/", "");
    console.log(`✅ Access token saved for store ${STORE_HASH}`);

    // Automatically register carrier after install
    await registerCarrier(STORE_HASH, ACCESS_TOKEN);

    return res.send("🎉 MyRover App Installed and Carrier Registered Successfully!");
  } catch (err) {
    console.error("❌ OAuth Callback Error:", err);
    return res.status(500).send("OAuth callback failed.");
  }
});

// === 3️⃣ REGISTER CARRIER ===
async function registerCarrier(storeHash, accessToken) {
  try {
    console.log("🚀 Registering MyRover carrier with BigCommerce...");

    const res = await fetch(`https://api.bigcommerce.com/stores/${storeHash}/v2/shipping/carriers`, {
      method: "POST",
      headers: {
        "X-Auth-Token": accessToken,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        carrier_id: CARRIER_ID,
        name: "MyRover Shipping",
        code: "myrover",
        type: "custom",
        settings: {
          name: "MyRover Delivery",
          is_enabled: true,
          connection: {
            url: `${BASE_URL}/rates`,
          },
          test_connection: {
            url: `${BASE_URL}/api/check`,
          },
        },
      }),
    });

    const data = await res.json();
    console.log("✅ Carrier registration response:", data);
  } catch (err) {
    console.error("❌ Error registering carrier:", err.message);
  }
}

// === 4️⃣ CHECK ENDPOINT ===
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT");
  const response = {
    data: {
      id: "myrover",
      name: "MyRover Shipping",
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  };
  return res.status(200).json(response);
});

// === 5️⃣ RATES ENDPOINT ===
app.post("/rates", (req, res) => {
  console.log("✅ /rates HIT:", JSON.stringify(req.body, null, 2));

  const response = {
    data: [
      {
        carrier_id: CARRIER_ID,
        carrier_code: "myrover",
        carrier_name: "MyRover Express",
        rate_id: "MYROVER_STANDARD",
        rate_name: "MyRover Delivery (1–2 days)",
        cost: 9.99,
        transit_time: "1-2 business days",
        currency: "CAD",
        description: "Fast GTA delivery",
      },
    ],
  };

  return res.status(200).json(response);
});

// === 🏠 ROOT ROUTE ===
app.get("/", (req, res) => res.send("🚚 MyRover Carrier App Running!"));

// === 🚀 START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
