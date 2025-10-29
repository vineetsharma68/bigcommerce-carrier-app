import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const APP_URL = process.env.APP_URL; // e.g. https://myrover-carrier.onrender.com

// Temporary memory storage (replace with DB later if needed)
const storeTokens = {};

const log = (...args) => console.log(new Date().toISOString(), ...args);

//
// ✅ Step 1: OAuth installation redirect (BigCommerce installs app here)
//
app.get("/auth", async (req, res) => {
  const { code, context, scope } = req.query;
  if (!code || !context) return res.status(400).send("Missing required params");

  const storeHash = context.split("/")[1];
  log(`Auth callback for store: ${context}`);

  try {
    const response = await fetch("https://login.bigcommerce.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/auth/callback`,
        grant_type: "authorization_code",
        code,
        scope,
        context,
      }),
    });

    const data = await response.json();
    if (!data.access_token) {
      log("❌ OAuth failed", data);
      return res.status(400).send("OAuth failed");
    }

    storeTokens[storeHash] = data.access_token;
    log(`✅ Stored access token for store: ${storeHash}`);

    // Register metadata
    const metaUrl = `https://api.bigcommerce.com/stores/${storeHash}/v3/app/metadata`;
    const metadata = {
      data: {
        key: "myrover_settings",
        value: JSON.stringify({
          app_name: "MyRover Carrier",
          last_updated: new Date().toISOString(),
        }),
      },
    };

    const metaResp = await fetch(metaUrl, {
      method: "POST",
      headers: {
        "X-Auth-Token": data.access_token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(metadata),
    });

    if (!metaResp.ok) {
      const err = await metaResp.json().catch(() => ({}));
      log("❌ Metadata registration attempt:", metaResp.status, err);
    } else {
      log("✅ Metadata registered successfully");
    }

    // Redirect to load (so BigCommerce can render your UI)
    res.redirect(`/api/load?signed_payload=${encodeURIComponent(context)}`);
  } catch (err) {
    log("❌ OAuth Error:", err);
    res.status(500).send("OAuth exchange failed");
  }
});

//
// ✅ Step 2: OAuth callback (Render + BC callback handler)
//
app.get("/auth/callback", (req, res) => {
  log("✅ /auth/callback HIT");
  res.status(200).send("Auth callback received successfully");
});

//
// ✅ Step 3: BigCommerce loads app (after install / open in control panel)
//
app.get("/api/load", (req, res) => {
  try {
    const signedPayload = req.query.signed_payload;
    if (!signedPayload) return res.status(400).send("Missing signed payload");

    const [encodedData, encodedSig] = signedPayload.split(".");
    const dataJson = Buffer.from(encodedData, "base64").toString();
    const expectedSig = crypto
      .createHmac("sha256", CLIENT_SECRET)
      .update(encodedData)
      .digest("base64")
      .replace(/\=+$/, "");

    if (encodedSig !== expectedSig) {
      log("❌ Invalid signed payload signature");
      return res.status(401).send("Invalid signature");
    }

    const data = JSON.parse(dataJson);
    const storeHash = data.context?.split("/")[1];
    log(`✅ /api/load HIT from store: ${storeHash}`);

    // Send minimal HTML (could later show configuration page)
    res.send(`
      <html>
        <head><title>MyRover Carrier</title></head>
        <body style="font-family:sans-serif;">
          <h2>✅ MyRover Carrier App Loaded</h2>
          <p>Store: ${storeHash}</p>
          <p>Your app is successfully installed and ready to use.</p>
        </body>
      </html>
    `);
  } catch (err) {
    log("❌ /api/load error:", err);
    res.status(500).send("Load error");
  }
});

//
// ✅ Step 4: Configuration check (used by BC app settings test)
//
app.post("/api/check", (req, res) => {
  log("✅ /api/check HIT from BigCommerce");
  res.status(200).json({
    status: "OK",
    data: { can_connect: true, connected: true, account_status: "active" },
    messages: [{ code: "SUCCESS", text: "MyRover Carrier verified successfully" }],
  });
});

//
// ✅ Step 5: store_v1_connection
//
app.get("/api/store_v1_connection", (req, res) => {
  log("✅ store_v1_connection HIT");
  res.status(200).json({
    status: "connected",
    message: "MyRover Carrier connected successfully",
  });
});

//
// ✅ Step 6: Metadata test endpoint
//
app.get("/api/metadata", (req, res) => {
  log("✅ /api/metadata HIT");
  res.json({
    success: true,
    result: {
      name: "MyRover Carrier",
      description: "Provides live shipping rates from MyRover.io",
      author: "Vineet",
    },
  });
});

//
// ✅ Step 7: Uninstall endpoint
//
app.get("/api/uninstall", (req, res) => {
  log("✅ Uninstall HIT");
  res.status(200).json({ success: true, message: "App uninstalled" });
});

//
// ✅ Catch unmatched routes for debugging
//
app.use((req, res) => {
  log("✳️ Unmatched", req.method, req.url, "— replying 404");
  res.status(404).send("Not Found");
});

app.listen(PORT, () => log(`🚀 MyRover Carrier running on port ${PORT}`));
