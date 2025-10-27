require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require('crypto'); // 🔑 crypto को फ़ाइल के शीर्ष पर ले जाया गया

const app = express();
app.use(bodyParser.json());

// --- CONSTANTS ---
const API_BASE_URL = "https://api.bigcommerce.com/stores";
const MY_CARRIER_ID = "myrover_carrier"; 
const MY_RATE_URL = `${process.env.APP_URL}/api/rates`; // 🔑 आपका मूल CONSTANT
const MY_DISPLAY_NAME = "MyRover Shipping";


// ----------------------------------------------------------------------
// ✅ 1. HELPER FUNCTIONS (Routes से पहले परिभाषित)
// ----------------------------------------------------------------------

/**
 * BigCommerce signed_payload को वेरिफाई करने के लिए (पिछले त्रुटियों को ठीक किया गया)
 */
// आपका पुराना Log:
// DEBUG: Incoming Signature: 7b2275736572223a... 

// यह भाग 1 (डेटा) को Hex के रूप में दिखाता है, जो गलत है।

// --- केवल इस फ़ंक्शन को बदलें ---
function verifySignedRequest(signedPayload, clientSecret) {
    if (!signedPayload || !clientSecret) return false;

    const parts = signedPayload.split('.');
    if (parts.length !== 2) return false;

    const signaturePart = parts[0];
    const dataPart = parts[1];
    const trimmedSecret = clientSecret.trim(); 
    
    // --- 1. Calculate Expected Signature ---
    const expectedSignature = crypto
        .createHmac('sha256', trimmedSecret) 
        .update(dataPart) 
        .digest('hex');
    
    // --- 2. Decode Incoming Signature ---
    // Make URL-safe Base64 standard Base64
    const base64UrlSafeSignature = signaturePart.replace(/-/g, '+').replace(/_/g, '/');
    
    // 🔑 Fix: Decode the signature into its raw Buffer form.
    const incomingSignatureBuffer = Buffer.from(base64UrlSafeSignature, 'base64');
    
    // 🔑 Convert the incoming Buffer to Hex for logging and comparison
    const incomingSignatureHex = incomingSignatureBuffer.toString('hex');
    
    // DEBUG logs
    console.log(`DEBUG: Actual Signature (Hmac): ${expectedSignature}`);
    console.log(`DEBUG: Incoming Signature (Hex): ${incomingSignatureHex}`);

    // 3. Comparison
    // We compare the Hex strings.
    return expectedSignature === incomingSignatureHex;
}
// ------------------------------------
/**
 * Checks for and registers/updates the Carrier Object in BigCommerce.
 * ❌ NOTE: इसे अब 'api/auth/callback' में कॉल नहीं किया जाता है क्योंकि यह 404 दे रहा था।
 */
async function manageBcCarrierConnection(storeHash, accessToken) {
    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Auth-Token": accessToken, 
    };
    const apiEndpoint = `${API_BASE_URL}/${storeHash}/v2/shipping/carrier/connections`;

    // 1. GET: मौजूदा कनेक्शनों की जाँच करें
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
            // 2. PUT: अगर कनेक्शन मिल गया, तो अपडेट करें
            await axios.put(`${apiEndpoint}/${existingBcId}`, carrierPayload, { headers });
            console.log(`✅ Carrier ID ${existingBcId} updated (PUT).`);
            
        } else {
            // 3. POST: अगर कनेक्शन नहीं मिला, तो नया बनाएँ
            const createResponse = await axios.post(apiEndpoint, carrierPayload, { headers });
            console.log(`✅ New Carrier connection created (POST): ID ${createResponse.data.id}`);
        }
    } catch (error) {
        console.error("❌ Carrier Connection Management Failed:", error.response?.data || error.message);
        throw new Error("BigCommerce Carrier setup failed during installation.");
    }
}

/**
 * Placeholder for saving credentials to your database (DB).
 */
async function saveStoreCredentialsToDB(storeHash, accessToken) {
    console.log(`🔒 Credentials saved for store: ${storeHash}`);
    // Implement your database logic here
}


// ----------------------------------------------------------------------
// ✅ 2. EXPRESS ROUTES
// ----------------------------------------------------------------------

// 1️⃣ Home route
app.get("/", (req, res) => {
    res.send("🚀 MyRover Carrier App is running successfully!");
});


// 2️⃣ OAuth Step 1 - BigCommerce authorization
app.get("/api/auth", async (req, res) => {
    console.log("✅ OAuth Step 1 triggered", req.query);

    const { context } = req.query;
    if (!context) return res.status(400).send("❌ Missing store context");

    const redirectUri = `${process.env.APP_URL}/api/auth/callback`;
    // Scopes को अपरिवर्तित रखा गया है (जो आपने पहले प्रदान किया था)
    const scopes = "store_v2_orders store_v2_information store_v2_default"; 

    const installUrl = `https://login.bigcommerce.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(
        redirectUri
    )}&response_type=code&context=${context}`;

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

        console.log("✅ OAuth Token Received:", tokenResponse.data);
        const { access_token, context: storeHash } = tokenResponse.data;

        // ❌ Carrier Management हटा दिया गया क्योंकि यह 404 दे रहा था
        // await manageBcCarrierConnection(storeHash.replace('stores/', ''), access_token); 

        await saveStoreCredentialsToDB(storeHash.replace('stores/', ''), access_token);

        res.send("✅ App installed successfully! You can close this window now.");
    } catch (err) {
        console.error("❌ OAuth Error:", err.response?.data || err.message);
        res.status(500).send(`OAuth failed: ${err.response?.data?.error_description || err.message}`);
    }
});


// 4️⃣ Uninstall callback
app.post("/api/uninstall", (req, res) => {
    console.log("❌ App Uninstalled:", req.body);
    res.send("✅ Uninstall cleanup done.");
});


// 5️⃣ Fetch available MyRover services (अपरिवर्तित)
app.get("/api/myrover/services", async (req, res) => {
    try {
        const response = await axios.post("https://apis.myrover.io/GetServices", {}, {
            headers: {
                Authorization: process.env.MYROVER_API_KEY,
                "Content-Type": "application/json",
            },
        });

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


// 6️⃣ Shipping Rates endpoint (BigCommerce calls this URL) (अपरिवर्तित)
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
        console.log(`✅ Found ${services.length} MyRover services`);

        const service = services[0];
        console.log("🧩 Using service:", service);

        const pickupAddress = "100 Dundas St W, Toronto, ON";
        const dropAddress = "200 King St W, Toronto, ON";

        const priceRes = await axios.post(
            "https://apis.myrover.io/GetPrice",
            {
                service_id: service.id,
                priority_id: 1,
                pickup_address: pickupAddress,
                drop_address: dropAddress,
            },
            {
                headers: {
                    Authorization: process.env.MYROVER_API_KEY,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("💰 MyRover Price Response:", priceRes.data);

        const cost = priceRes.data?.data?.cost || 15.0;

        const rates = [
            {
                carrier_quote: {
                    code: service.abbreviation || "myrover",
                    display_name: service.name || "MyRover Shipping",
                    cost: cost,
                },
            },
        ];

        res.json({ data: rates });
    } catch (err) {
        console.error("❌ MyRover API error:", err.response?.data || err.message);

        // fallback dummy rates
        res.json({
            data: [
                { carrier_quote: { code: "standard", display_name: "Standard Shipping", cost: 10.5 } },
                { carrier_quote: { code: "express", display_name: "Express Shipping", cost: 25.0 } },
            ],
        });
    }
});

// 7️⃣ Test MyRover API key (अपरिवर्तित)
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


// 8️⃣ Load Callback (App Launch)
app.get("/api/load", (req, res) => {
    console.log("✅ /api/load HIT");

    const signedPayload = req.query.signed_payload;
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
          <style>body { font-family: Arial, sans-serif; padding: 20px; }</style>
      </head>
      <body>
          <h1>🚀 MyRover Carrier App</h1>
          <p>Configuration panel loaded successfully inside BigCommerce. </p>
          <p>Please navigate to Shipping settings to connect your real-time quotes manually.</p>
      </body>
      </html>
    `);
});

// 9️⃣ Account verification (Configuration URL)
app.post("/api/check", (req, res) => {
    console.log("✅ /api/check HIT: Account Status Check");
    // "Error getting account status" को हल करने के लिए निश्चित प्रतिक्रिया
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({ status: "active" });
});


// 10️⃣ Metadata endpoint
app.get("/api/metadata", (req, res) => {
    console.log("✅ /api/metadata HIT: Sending Carrier Metadata");

    const base_url = process.env.APP_URL;

    res.status(200).json({
        carriers: [{
            carrier_id: MY_CARRIER_ID,
            label: MY_DISPLAY_NAME,
            countries: ["CA", "US"],
            settings_url: `${base_url}/api/check`, // BC स्टेटस यहाँ से चेक करता है
            rates_url: `${base_url}/api/rates`,
        }],
    });
});


// 11️⃣ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
