import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Middlewares
app.use(cors());
app.use(bodyParser.json());

// ✅ Root
app.get("/", (req, res) => {
  res.send("🚚 MyRover Carrier App is running!");
});

//
// ✅ 1. Metadata endpoint (tells BigCommerce what carrier you are)
//
app.get("/api/metadata", (req, res) => {
  console.log("✅ /api/metadata HIT");
  res.status(200).json({
    carriers: [
      {
        carrier_id: 530,
        label: "MyRover Shipping",
        countries: ["CA"],
        settings_url: "https://myrover-carrier.onrender.com/api/check",
        rates_url: "https://myrover-carrier.onrender.com/api/rates",
      },
    ],
  });
});

//
// ✅ 2. Account Check endpoint (BigCommerce validates connection here)
//
app.post("/api/check", (req, res) => {
  console.log("✅ /api/check HIT: Account Status Check");
  console.log("Headers:", JSON.stringify(req.headers, null, 2));
  console.log("Body:", JSON.stringify(req.body, null, 2));

  const response = {
    data: {
      id: "myrover",
      name: "MyRover Shipping",
      account_status: "active",
      connected: true,
      message: "Connection verified successfully",
    },
  };

  console.log("🚀 Sending Response:", JSON.stringify(response, null, 2));
  res.status(200).json(response);
});

//
// ✅ 3. Rates endpoint (returns real-time shipping quotes)
//
app.post("/api/rates", (req, res) => {
  console.log("📦 /api/rates HIT");
  console.log("Incoming Rate Request:", JSON.stringify(req.body, null, 2));

  const response = {
    data: {
      rates: [
        {
          carrier_id: 530,
          carrier_name: "MyRover Shipping",
          service_code: "MYROVER_STANDARD",
          service_name: "MyRover Standard Delivery",
          description: "Fast and reliable local delivery within GTA.",
          price: 9.99,
          currency: "CAD",
          transit_time: "1-2 business days",
        },
        {
          carrier_id: 530,
          carrier_name: "MyRover Shipping",
          service_code: "MYROVER_EXPRESS",
          service_name: "MyRover Express",
          description: "Same-day delivery (if ordered before 12 PM).",
          price: 19.99,
          currency: "CAD",
          transit_time: "Same Day",
        },
      ],
    },
  };

  console.log("🚀 Sending Rates:", JSON.stringify(response, null, 2));
  res.status(200).json(response);
});

//
// ✅ 4. Load endpoint (optional: helps BigCommerce test credentials)
//
app.get("/api/load", (req, res) => {
  console.log("✅ /api/load HIT");
  res.status(200).json({
    data: {
      success: true,
      message: "MyRover app loaded successfully.",
    },
  });
});

//
// ✅ 5. Fallback 404
//
app.use((req, res) => {
  res.status(404).json({ error: "Not Found" });
});

//
// ✅ Start server
//
app.listen(PORT, () => {
  console.log(`🚀 MyRover Carrier App running on port ${PORT}`);
});
