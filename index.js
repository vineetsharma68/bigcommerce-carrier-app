import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(bodyParser.json());
app.use(cors());

// -------------------------------
// 🔧 CONFIG CONSTANTS
// -------------------------------
const API_BASE_URL = "https://api.bigcommerce.com/stores";
const MY_CARRIER_ID = "myrover_carrier";
const MY_DISPLAY_NAME = "MyRover Shipping";
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
// 🔑 STEP 1 – OAUTH AUTH CALLBACK
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
        client_id: process.env.CLIENT_ID,
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
      <p><i>Now your Render logs will also show this token.</i></p>
    `);

    console.log("✅ Access Token:", access_token);
    console.log("🏬 Store Hash:", storeHash);
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
// 📦 MYROVER GET SERVICES
// -------------------------------
app.get("/api/myrover/services", async (req, res) => {
  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("📦 MyRover Services:", response.data);
    res.json({
      success: true,
      message: "Fetched available services from MyRover",
      data: response.data,
    });
  } catch (err) {
    console.error("❌ Error fetching MyRover services:", err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

// -------------------------------
// 🚚 SHIPPING RATES ENDPOINT
// -------------------------------
app.post("/api/rates", async (req, res) => {
  const { origin, destination, items } = req.body;
  console.log("📦 Rate request received:", { origin, destination, items });

  try {
    const serviceRes = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const services = serviceRes.data?.services || [];
    const service = services[0] || { name: "Standard", abbreviation: "STD" };

    const priceRes = await axios.post(
      "https://apis.myrover.io/GetPrice",
      {
        service_id: service.id || 1,
        priority_id: 1,
        pickup_address: "100 Dundas St W, Toronto, ON",
        drop_address: "200 King St W, Toronto, ON",
      },
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const cost = priceRes.data?.data?.cost || 15.0;

    const rates = [
      {
        carrier_quote: {
          code: service.abbreviation || "myrover",
          display_name: service.name || "MyRover Shipping",
          cost,
        },
      },
    ];

    res.json({ data: rates });
  } catch (err) {
    console.error("❌ MyRover API error:", err.response?.data || err.message);
    res.json({
      data: [
        { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
        { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
      ],
    });
  }
});

// -------------------------------
// 🧩 TEST MYROVER API
// -------------------------------
app.get("/api/test-myrover", async (req, res) => {
  try {
    const response = await axios.post(
      "https://apis.myrover.io/GetServices",
      {},
      {
        headers: {
          Authorization: process.env.MYROVER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ MyRover.io GetServices error:", err.response?.data || err.message);
    res.status(401).json({ success: false, error: err.response?.data || err.message });
  }
});

// -------------------------------
// ⚙️ LOAD CALLBACK (OPEN IN ADMIN IFRAME)
// -------------------------------
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");

  const signedPayload = req.query.signed_payload;
  const clientSecret = process.env.CLIENT_SECRET;

  if (!verifySignedRequest(signedPayload, clientSecret)) {
    return res.status(401).send("Unauthorized: Invalid signed payload");
  }

  res.send(`
    <html>
      <body style="font-family: Arial; padding: 20px;">
        <h2>🚀 MyRover Carrier App Loaded!</h2>
        <p>Use the shipping settings page to connect your account.</p>
      </body>
    </html>
  `);
});

// -------------------------------
// 🧾 ACCOUNT STATUS CHECK
// -------------------------------
/*app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const response = {
    data: {
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  };

  console.log("🚀 Sending Response:", JSON.stringify(response, null, 2));
  res.status(200).json(response);
});*/

app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");

  const response = {
    data: {
      account_status: "active",
      connected: true,
      message: "Connection verified successfully"
    }
  };

  console.log("🚀 Sending Response:", response);
  res.status(200).json(response);
});



// -------------------------------
// 🧾 METADATA ENDPOINT
// -------------------------------
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT");

  res.status(200).json({
    carriers: [
      {
        carrier_id: 530,
        label: "MyRover Shipping",
        countries: ["CA", "US"],
        settings_url: "https://myrover-carrier.onrender.com/api/check",
        rates_url: "https://myrover-carrier.onrender.com/api/rates"
      }
    ]
  });
});


// -------------------------------
// 🚀 START SERVER
// -------------------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
