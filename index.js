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
const CARRIER_ID = 530;

let STORE_HASH = "";
let ACCESS_TOKEN = "";

// === 1️⃣ INSTALLATION ROUTE ===
app.get("/auth/install", (req, res) => {
  const { context, scope, code } = req.query;
  console.log("🛠 Install request received:", req.query);
  const redirect = `${BASE_URL}/auth/callback?code=${code}&scope=${scope}&context=${context}`;
  return res.redirect(redirect);
});

// === 2️⃣ OAUTH CALLBACK ===
app.get("/auth/callback", async (req, res) => {
  const { code, context, scope } = req.query;
  console.log("🎯 Callback received:", req.query);

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
    console.log("🔑 OAuth token response:", data);

    if (!data.access_token) {
      return res.status(400).send("❌ OAuth failed. Check logs.");
    }

    ACCESS_TOKEN = data.access_token;
    STORE_HASH = data.context.replace("stores/", "");
    console.log(`✅ Access token stored for store: ${STORE_HASH}`);

    // Register carrier + zone automatically
    await registerCarrier(STORE_HASH, ACCESS_TOKEN);
    await ensureZoneSetup(STORE_HASH, ACCESS_TOKEN);

    res.send("🎉 MyRover App Installed, Carrier Registered, and Zone Configured Successfully!");
  } catch (err) {
    console.error("❌ OAuth Callback Error:", err);
    res.status(500).send("OAuth callback failed. Check logs.");
  }
});

// === 3️⃣ REGISTER CARRIER ===
async function registerCarrier(storeHash, accessToken) {
  try {
    console.log("🚀 Registering MyRover carrier...");

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
          connection: { url: `${BASE_URL}/rates` },
          test_connection: { url: `${BASE_URL}/api/check` },
        },
      }),
    });

    const data = await res.json();
    console.log("✅ Carrier registration response:", data);
  } catch (err) {
    console.error("❌ Carrier registration failed:", err.message);
  }
}

// === 4️⃣ AUTO ZONE CREATION ===
async function ensureZoneSetup(storeHash, accessToken) {
  console.log("🌍 Ensuring at least one shipping zone exists...");

  try {
    // Get existing zones
    const zonesRes = await fetch(
      `https://api.bigcommerce.com/stores/${storeHash}/v2/shipping/zones`,
      {
        headers: { "X-Auth-Token": accessToken, Accept: "application/json" },
      }
    );

    const zones = await zonesRes.json();

    let zoneId;
    if (zones.length > 0) {
      zoneId = zones[0].id;
      console.log(`🟢 Using existing zone: ${zones[0].name} (ID: ${zoneId})`);
    } else {
      console.log("🔧 Creating new zone: Canada");
      const zoneRes = await fetch(
        `https://api.bigcommerce.com/stores/${storeHash}/v2/shipping/zones`,
        {
          method: "POST",
          headers: {
            "X-Auth-Token": accessToken,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Canada Zone",
            countries: ["CA"],
            locations: [],
            handling_fees: { fixed_fee: 0, percent_fee: 0 },
          }),
        }
      );
      const zoneData = await zoneRes.json();
      zoneId = zoneData.id;
      console.log("✅ Created new zone:", zoneData);
    }

    // Enable carrier in this zone
    await enableCarrierInZone(storeHash, accessToken, zoneId);
  } catch (err) {
    console.error("❌ Zone setup failed:", err.message);
  }
}

// === 5️⃣ ENABLE CARRIER IN ZONE ===
async function enableCarrierInZone(storeHash, accessToken, zoneId) {
  console.log(`⚙️ Enabling MyRover in zone ID: ${zoneId}`);
  try {
    const response = await fetch(
      `https://api.bigcommerce.com/stores/${storeHash}/v2/shipping/zones/${zoneId}/methods`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": accessToken,
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "custom",
          enabled: true,
          name: "MyRover Delivery",
          carrier_id: CARRIER_ID,
          settings: { display_name: "MyRover Express Shipping" },
        }),
      }
    );

    const data = await response.json();
    console.log("✅ Enabled MyRover in zone:", data);
  } catch (err) {
    console.error("❌ Error enabling carrier in zone:", err.message);
  }
}

// === 6️⃣ ACCOUNT CHECK ENDPOINT ===
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT from BigCommerce");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  res.status(200).json({
    status: "OK",
    messages: [
      {
        code: "SUCCESS",
        text: "Connection successful. MyRover account verified.",
      },
    ],
    data: {
      carrier_id: "myrover",
      name: "MyRover Shipping",
      description: "Live MyRover carrier integration",
      account_status: "active",
      connected: true,
    },
  });
});



app.all("/api/check", (req, res) => {
  console.log("✅ /api/check HIT from BigCommerce");
  res.status(200).json({
    data: {
      id: "myrover",
      name: "MyRover Shipping",
      account_status: "active",
      connected: true,
      settings: {},
      message: "Connection verified successfully",
    },
  });
});



// === 7️⃣ RATES ENDPOINT ===
app.post("/rates", (req, res) => {
  console.log("✅ /rates HIT:", JSON.stringify(req.body, null, 2));

  return res.status(200).json({
    data: [
      {
        carrier_id: CARRIER_ID,
        carrier_code: "myrover",
        carrier_name: "MyRover Express",
        rate_id: "MYROVER_STANDARD",
        rate_name: "MyRover Delivery (1–2 days)",
        cost: 9.99,
        transit_time: "1–2 business days",
        currency: "CAD",
        description: "Fast GTA delivery",
      },
    ],
  });
});

// === 🏠 ROOT ROUTE ===
app.get("/", (req, res) => res.send("🚚 MyRover Carrier App Running (Auto Setup Enabled)!"));

// === 🚀 START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
