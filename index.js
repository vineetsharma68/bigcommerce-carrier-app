import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());
app.use(cors());

// -------------------------------
// 🔧 CONFIGURATION
// -------------------------------
const STORE_HASH = "sjd7gztdev";
const CLIENT_ID = "do8br6kf70cvh5klt4ffk7mvz3qb6rp";
const ACCESS_TOKEN = "d0ubep2i3smp9cabsyyby31hvdd8171";
const CARRIER_ID = 530;
const MY_CARRIER_CODE = "myrover";
const MY_DISPLAY_NAME = "MyRover Shipping";
const API_BASE_URL = "https://api.bigcommerce.com/stores";
const APP_URL = process.env.APP_URL || "https://myrover-carrier.onrender.com";

// -------------------------------
// 🧠 VERIFY SIGNED PAYLOAD
// -------------------------------
function verifySignedRequest(signedPayload, clientSecret) {
  if (!signedPayload || !clientSecret) return false;
  const parts = signedPayload.split(".");
  if (parts.length !== 2) return false;

  const signaturePart = parts[0];
  const dataPart = parts[1];

  const expectedSignature = crypto
    .createHmac("sha256", clientSecret.trim())
    .update(dataPart)
    .digest("hex");

  const incomingSignature = Buffer.from(
    signaturePart.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("hex");

  return expectedSignature === incomingSignature;
}

// -------------------------------
// 🏠 ROOT ROUTE
// -------------------------------
app.get("/", (req, res) => {
  res.send("🚀 MyRover Carrier App is running successfully on Render!");
});

// -------------------------------
// 🔑 OAUTH CALLBACK (INSTALL)
// -------------------------------
app.get("/api/auth/callback", async (req, res) => {
  console.log("✅ /api/auth/callback HIT:", req.query);
  const { code, context, scope } = req.query;

  if (!code || !context)
    return res.status(400).send("❌ Missing OAuth parameters.");

  try {
    const tokenResponse = await axios.post(
      "https://login.bigcommerce.com/oauth2/token",
      {
        client_id: process.env.CLIENT_ID || CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        redirect_uri: `${APP_URL}/api/auth/callback`,
        grant_type: "authorization_code",
        code,
        scope,
        context,
      }
    );

    console.log("🔑 BigCommerce Token Response:", tokenResponse.data);
    const { access_token, context: storeHash, user } = tokenResponse.data;

    res.send(`
      <h2>✅ MyRover App Installed Successfully!</h2>
      <p><b>Store Hash:</b> ${storeHash}</p>
      <p><b>Access Token:</b> ${access_token}</p>
      <p><b>User:</b> ${user?.email}</p>
    `);
  } catch (err) {
    console.error("❌ OAuth Error:", err.response?.data || err.message);
    res
      .status(500)
      .send(`OAuth exchange failed: ${err.response?.data?.error || err.message}`);
  }
});

// -------------------------------
// ❌ UNINSTALL CALLBACK
// -------------------------------
app.post("/api/uninstall", (req, res) => {
  console.log("❌ App Uninstalled:", req.body);
  res.send("✅ Uninstall cleanup done.");
});

// -------------------------------
// 🧾 ACCOUNT STATUS CHECK
// -------------------------------
app.post("/api/check", async (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  const response = {
    data: {
      id: MY_CARRIER_CODE,
      name: MY_DISPLAY_NAME,
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  };
  console.log("🚀 Sending Response:", JSON.stringify(response, null, 2));
  return res.status(200).json(response);
});

// compatibility fallback routes
app.post("/account-status", (req, res) => res.status(200).json({
  data: {
    id: MY_CARRIER_CODE,
    name: MY_DISPLAY_NAME,
    account_status: "active",
    connected: true,
    message: "Account verified successfully (via /account-status)",
  },
}));
app.post("/account/status", (req, res) => res.status(200).json({
  data: {
    id: MY_CARRIER_CODE,
    name: MY_DISPLAY_NAME,
    account_status: "active",
    connected: true,
    message: "Account verified successfully (via /account/status)",
  },
}));

// -------------------------------
// 📦 RATES ENDPOINT
// -------------------------------
app.post("/api/rates", async (req, res) => {
  console.log("✅ /api/rates HIT");
  console.log("Request body:", JSON.stringify(req.body, null, 2));

  try {
    const rateResponse = {
      data: [
        {
          carrier_id: CARRIER_ID,
          carrier_code: MY_CARRIER_CODE,
          carrier_name: "MyRover Express",
          rate_id: "MYROVER_STANDARD",
          rate_name: "MyRover Delivery (1–2 days)",
          cost: 9.99,
          transit_time: "1-2 business days",
          currency: "CAD",
          description: "Fast delivery within GTA area",
        },
      ],
    };
    console.log("🚀 Sending rate response:", JSON.stringify(rateResponse, null, 2));
    return res.status(200).json(rateResponse);
  } catch (err) {
    console.error("❌ Error in /api/rates:", err.message);
    return res.status(500).json({ error: "Rate calculation failed" });
  }
});

// -------------------------------
// 🧩 METADATA ENDPOINT
// -------------------------------
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT: Sending Carrier Metadata");
  res.status(200).json({
    carriers: [
      {
        carrier_id: MY_CARRIER_CODE,
        label: MY_DISPLAY_NAME,
        countries: ["CA"],
        settings_url: `${APP_URL}/account-status`,
        rates_url: `${APP_URL}/api/rates`,
      },
    ],
  });
});

// -------------------------------
// 🚚 REGISTER CARRIER FUNCTION
// -------------------------------
async function registerCarrier() {
  try {
    console.log("🚀 Registering MyRover carrier with BigCommerce...");
    const response = await fetch(
      `${API_BASE_URL}/${STORE_HASH}/v2/shipping/carriers`,
      {
        method: "POST",
        headers: {
          "X-Auth-Token": ACCESS_TOKEN,
          "X-Auth-Client": CLIENT_ID,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          carrier_id: CARRIER_ID,
          name: MY_DISPLAY_NAME,
          code: MY_CARRIER_CODE,
          type: "custom",
          settings: {
            name: "MyRover Delivery",
            is_enabled: true,
            connection: { url: `${APP_URL}/api/rates` },
            test_connection: { url: `${APP_URL}/api/check` },
          },
        }),
      }
    );
    const data = await response.json();
    console.log("✅ Carrier registration response:", data);
  } catch (err) {
    console.error("❌ Error registering carrier:", err.message);
  }
}

// -------------------------------
// 🚀 START SERVER
// -------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log(`✅ Server running on port ${PORT}`);
  await registerCarrier();
});
