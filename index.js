const express = require("express");
const app = express();

app.use(express.json());

// --- Load callback
app.get("/api/load", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({
    data: {
      app_id: "myrover_carrier",
      name: "MyRover Shipping",
      regions: ["CA"],
      settings: {}
    }
  }));
});

// --- Check callback
app.post("/api/check", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.status(200).send(JSON.stringify({
    data: { status: "active" }
  }));
});

// --- Metadata
app.get("/api/metadata", (req, res) => {
  res.status(200).json({
    carriers: [
      {
        carrier_id: "myrover",
        label: "MyRover Shipping",
        countries: ["CA"],
      }
    ]
  });
});

// --- Rates
app.post("/api/rates", (req, res) => {
  res.status(200).json({
    quotes: [
      {
        carrier_id: "myrover",
        carrier_name: "MyRover Shipping",
        service_id: "standard",
        service_name: "Standard Delivery",
        rate: 12.99,
        transit_time: "3 days"
      }
    ]
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
