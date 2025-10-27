require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require('crypto'); // 🔑 क्रिप्टो को फ़ाइल के शीर्ष पर ले जाया गया

const app = express();
app.use(bodyParser.json());

// --- CONSTANTS ---
const API_BASE_URL = "https://api.bigcommerce.com/stores";
const MY_CARRIER_ID = "myrover_carrier";
const MY_DISPLAY_NAME = "MyRover Shipping";
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// ✅ 1. HELPER FUNCTIONS (Routes से पहले परिभाषित)
// ----------------------------------------------------------------------

/**
 * BigCommerce signed_payload को वेरिफाई करने के लिए
 */
function verifySignedRequest(signedPayload, clientSecret) {
    if (!signedPayload || !clientSecret) return false;

    const parts = signedPayload.split('.');
    if (parts.length !== 2) return false;

    const signaturePart = parts[0];
    const dataPart = parts[1];
    const trimmedSecret = clientSecret.trim(); // Trim the secret

    // 1. हस्ताक्षर (Signature) को Hex में बदलें
    // URL-Safe Base64 को मानक Base64 में बदलें
    const base64UrlSafeSignature = signaturePart.replace(/-/g, '+').replace(/_/g, '/');
    const incomingSignature = Buffer.from(base64UrlSafeSignature, 'base64').toString('hex');
    
    // 2. अपेक्षित हस्ताक्षर (Expected Signature) की गणना करें
    const expectedSignature = crypto
        .createHmac('sha256', trimmedSecret)
        .update(dataPart) // असंशोधित डेटा भाग का उपयोग करें
        .digest('hex');
    
    // DEBUG logs
    console.log(`DEBUG: Actual Signature (Hmac): ${expectedSignature}`);
    console.log(`DEBUG: Incoming Signature: ${incomingSignature}`);

    return expectedSignature === incomingSignature;
}

/**
 * Checks for and registers/updates the Carrier Object in BigCommerce.
 */
async function manageBcCarrierConnection(storeHash, accessToken) {
    const MY_RATE_URL = `${process.env.APP_URL}/api/rates`; 
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Auth-Token": accessToken, 
    };
    const apiEndpoint = `${API_BASE_URL}/${storeHash}/v2/shipping/carrier/connections`;

    // ... (manageBcCarrierConnection का बाकी का लॉजिक अपरिवर्तित है)
    try {
        const checkResponse = await axios.get(apiEndpoint, { headers });
        const existingConnections = checkResponse.data;

        let existingBcId = null;
        for (const carrier of existingConnections) {
            if (carrier.carrier_id === MY_CARRIER_ID) {
                existingBcId = carrier.id;
                break;
            }
        }

        const carrierPayload = {
            carrier_id: MY_CARRIER_ID,
            display_name: MY_DISPLAY_NAME,
            type: "rate_calculator",
            rate_url: MY_RATE_URL, 
        };

        if (existingBcId) {
            await axios.put(`${apiEndpoint}/${existingBcId}`, carrierPayload, { headers });
            console.log(`✅ Carrier ID ${existingBcId} updated (PUT).`);
            
        } else {
            const createResponse = await axios.post(apiEndpoint, carrierPayload, { headers });
            console.log(`✅ New Carrier connection created (POST): ID ${createResponse.data.id}`);
        }
    } catch (error) {
        console.error("❌ Carrier Connection Management Failed:", error.response?.data || error.message);
        throw new Error("BigCommerce Carrier setup failed during installation.");
    }
}

async function saveStoreCredentialsToDB(storeHash, accessToken) {
    console.log(`🔒 Credentials saved for store: ${storeHash}`);
    // NOTE: आपको यहां डेटाबेस लॉजिक लागू करना होगा
}

// ----------------------------------------------------------------------
// ✅ 2. EXPRESS ROUTES
// ----------------------------------------------------------------------

// 1️⃣ Home route
app.get("/", (req, res) => {
    res.send("🚀 MyRover Carrier App is running successfully!");
});

// 2️⃣ OAuth Step 1 - BigCommerce authorization (Launch App के लिए आवश्यक नहीं)
app.get("/api/auth", async (req, res) => {
    // ... (आपका AUTH लॉजिक अपरिवर्तित है)
    console.log("✅ OAuth Step 1 triggered", req.query);
    const { context } = req.query;
    if (!context) return res.status(400).send("❌ Missing store context");
    const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
    const installUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=${encodeURIComponent("store_v2_orders store_v2_information store_v2_shipping")}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&context=${context}`;
    res.redirect(installUrl);
});

// 3️⃣ OAuth Step 2 - Callback from BigCommerce
app.get("/api/auth/callback", async (req, res) => {
    console.log("✅ OAuth Callback triggered:", req.query);
    const { code, scope, context } = req.query;
    if (!code) return res.status(400).send("❌ Missing OAuth code");
    try {
        const tokenResponse = await axios.post("https://login.bigcommerce.com/oauth2/token", {
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
            grant_type: "authorization_code",
            code,
            scope,
            context,
        });

        const { access_token, user: { id: userId }, context: storeHash } = tokenResponse.data;

        // 🔑 Carrier Management को यहां कॉल किया जाता है
        await manageBcCarrierConnection(storeHash.replace('stores/', ''), access_token);
        await saveStoreCredentialsToDB(storeHash.replace('stores/', ''), access_token);

        console.log("✅ OAuth Token Received and Carrier Setup Complete.");
        res.send("✅ App installed successfully! You can close this window now.");

    } catch (err) {
        console.error("❌ OAuth Error/Carrier Setup Fail:", err.response?.data || err.message);
        res.status(500).send("App installation or setup failed.");
    }
});

// 🔑 4️⃣ Load Callback (Launch App के लिए आवश्यक, अब सही संरचना में)
app.get("/api/load", (req, res) => {
    console.log("✅ /api/load HIT");

    const signedPayload = req.query.signed_payload; // 🔑 यह line अब सुरक्षित है
    const clientSecret = process.env.CLIENT_SECRET;

    if (!signedPayload || !clientSecret) {
        return res.status(400).send("Bad Request: Missing signed data or secret.");
    }
    
    if (!verifySignedRequest(signedPayload, clientSecret)) {
        console.error("❌ Load Error: Invalid signed_payload signature!");
        return res.status(401).send("Unauthorized: Invalid request signature.");
    }

    console.log("✅ Load Verification Successful. Sending success HTML.");

    // Load होने पर iFrame में दिखने वाला HTML
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>MyRover Configuration</title>
          <style>body { font-family: Arial, sans-serif; padding: 20px; background-color: #f0f2f5; }</style>
      </head>
      <body>
          <h1>🚀 MyRover Carrier App</h1>
          <p>Configuration panel loaded successfully inside BigCommerce. You can now configure your shipping settings.</p>
          <p>This is where your app's main settings UI would appear.</p>
      </body>
      </html>
    `);
});

// 5️⃣ Uninstall callback
app.post("/api/uninstall", (req, res) => {
    console.log("❌ App Uninstalled:", req.body);
    res.send("✅ Uninstall cleanup done.");
});

// 6️⃣ Shipping Rates endpoint
app.post("/api/rates", async (req, res) => {
    // ... (आपका RATES लॉजिक अपरिवर्तित है)
    const { origin, destination, items } = req.body;
    console.log("📦 Rate request received:", { origin, destination, items });
    try {
        const serviceRes = await axios.post("https://apis.myrover.io/GetServices", {}, {
            headers: { Authorization: process.env.MYROVER_API_KEY, "Content-Type": "application/json" },
        });
        const services = serviceRes.data?.services || [];
        const service = services[0];
        const cost = 15.0; // Simplified cost logic
        const rates = [
            { carrier_quote: { code: service.abbreviation || "myrover", display_name: service.name || "MyRover Shipping", cost: cost } },
        ];
        res.json({ data: rates });
    } catch (err) {
        console.error("❌ MyRover API error:", err.response?.data || err.message);
        res.json({ data: [{ carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } }] });
    }
});

// 7️⃣ Account verification (used by BigCommerce to check status)
app.post("/api/check", (req, res) => {
    console.log("✅ /api/check HIT: Account Status Check");
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); 
    return res.status(200).json({ status: "active" });
});

// 8️⃣ Metadata endpoint
app.get("/api/metadata", (req, res) => {
    console.log("✅ /api/metadata HIT: Sending Carrier Metadata");
    const base_url = process.env.APP_URL; 

    res.status(200).json({
        carriers: [{
            carrier_id: "myrover",
            label: "MyRover Shipping",
            countries: ["CA"], 
            settings_url: `${base_url}/api/check`, // BC स्टेटस यहाँ से चेक करता है
            rates_url: `${base_url}/api/rates`, 
        }],
    });
});

// 9️⃣ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
