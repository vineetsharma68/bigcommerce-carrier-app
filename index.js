import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier API is live");
});

// ✅ TEST CONNECTION (BigCommerce calls this when configuring)
app.post("/v1/shipping/connection", (req, res) => {
  try {
    console.log("✅ /v1/shipping/connection HIT from BigCommerce");
    console.log("HEADERS:", req.headers);
    console.log("BODY:", req.body);

    // Always respond with a simple valid JSON object
    res.status(200).json({});
  } catch (err) {
    console.error("❌ Error in /v1/shipping/connection:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ SHIPPING RATES (BigCommerce calls this at checkout)
app.post("/v1/shipping/rates", (req, res) => {
  try {
    console.log("✅ /v1/shipping/rates HIT from BigCommerce");
    console.log("BODY:", JSON.stringify(req.body, null, 2));

    // ✅ Sample rate response format BigCommerce expects
    const rates = [
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
    ];

    res.status(200).json({ data: rates });
  } catch (err) {
    console.error("❌ Error in /v1/shipping/rates:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ FALLBACK HANDLER
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier API running on port ${PORT}`);
});
