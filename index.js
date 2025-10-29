// index.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const tokenCache = {}; // store access tokens in-memory for dev

// Utility logger
const log = (...args) => console.log(new Date().toISOString(), ...args);

//
// ============ 1️⃣ BASIC TEST ROUTE ============
app.get("/", (req, res) => res.send("✅ MyRover Carrier App Running"));

//
// ============ 2️⃣ OAUTH INSTALLATION FLOW ============
app.get("/api/auth/callback", async (req, res) => {
  try {
    log("✅ /api/auth/callback HIT");

    const { code, context, scope } = req.query;
    if (!code || !context) {
      return res.status(400).send("Missing code or context");
    }

    const tokenUrl = "https://login.bigcommerce.com/oauth2/token";
    const payload = {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      grant_type: "authorization_code",
      code,
      scope,
      context,
    };

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await tokenResponse.json();
    log("🎟️ Token response:", data);

    if (!data.access_token) {
      return res.status(400).json({ error: "Failed to get access token", details: data });
    }

    const storeHash = context.replace("stores/", "");
    tokenCache[storeHash] = data.access_token;

    log(`✅ Stored access token for store: ${storeHash}`);

    // Redirect to load page
    return res.redirect(`/api/load?store_hash=${storeHash}`);
  } catch (error) {
    log("❌ Auth callback error:", error);
    return res.status(500).send("Auth callback failed");
  }
});

//
// ============ 3️⃣ LOAD & UNINSTALL ============
app.get("/api/load", (req, res) => {
  log("✅ /api/load HIT from BigCommerce");
  res.status(200).send(`
    <html>
      <body style="font-family: sans-serif; text-align:center; margin-top:40px;">
        <h2>🎉 MyRover Installed Successfully!</h2>
        <p>You can now configure <b>MyRover</b> under Settings → Shipping → Carriers.</p>
      </body>
    </html>
  `);
});

app.get("/api/uninstall", (req, res) => {
  log("✅ Uninstall HIT");
  res.status(200).send({ success: true });
});

//
// ============ 4️⃣ METADATA ============
app.get("/metadata", (req, res) => {
  log("✅ Metadata endpoint HIT");

  const metadata = {
    configurations: {
      connection: [
        {
          code: "api_token",
          type: "password",
          label: "API Token",
          description: "API token to access MyRover carrier.",
          required: true,
        },
        {
          code: "account_key",
          type: "text",
          label: "Account Key",
          description: "Your MyRover Account Key.",
          required: true,
        },
        {
          code: "use_sandbox",
          type: "checkbox",
          label: "Use Sandbox Mode",
          description: "Enable sandbox mode for testing",
          required: false,
        },
      ],
      settings: [
        {
          code: "destination_type",
          type: "select",
          label: "Destination Type",
          description: "Choose Residential or Commercial deliveries.",
          required: false,
          map: {
            residential: "Residential",
            commercial: "Commercial",
          },
        },
        {
          code: "delivery_services",
          type: "multiselect",
          label: "Delivery Services",
          description: "Select supported delivery services.",
          required: true,
          map: {
            "1_day_air": "1 Day Air",
            "2_day_air": "2 Day Air",
            "1_day_ground": "1 Day Ground Delivery",
            "2_day_ground": "2 Day Ground Delivery",
          },
        },
      ],
    },
  };

  return res.status(200).json({ success: true, result: metadata });
});

//
// ============ 5️⃣ CARRIER CHECK ============
app.post("/api/check", (req, res) => {
  log("/api/check HIT from BigCommerce headers:", req.headers["user-agent"]);
  return res.status(200).json({
    status: "OK",
    data: {
      can_connect: true,
      connected: true,
      account_status: "active",
      message: "Connection verified successfully",
    },
    messages: [{ code: "SUCCESS", text: "Connection successful. MyRover verified." }],
  });
});

//
// ============ 6️⃣ SHIPPING ENDPOINTS ============
app.post("/v1/shipping/connection", (req, res) => {
  log("✅ /v1/shipping/connection HIT from BigCommerce");
  return res.status(200).json({
    status: "OK",
    message: "MyRover connection verified successfully",
  });
});

app.post("/v1/shipping/rates", (req, res) => {
  log("📦 /v1/shipping/rates HIT from BigCommerce");

  const response = {
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
  };

  return res.status(200).json(response);
});

//
// ============ 7️⃣ ERROR HANDLING ============
app.use((req, res) => {
  log(`✳️ Unmatched ${req.method} ${req.url} — replying 404`);
  res.status(404).send("Not Found");
});

//
// ============ 8️⃣ SERVER START ============
app.listen(PORT, () => {
  log(`🚀 MyRover Carrier app listening on port ${PORT}`);
});
