import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import { getBaseData } from "./utils/larkBase.js";

const app = express();
app.use(bodyParser.json());

// 🔹 Endpoint utama (health check)
app.get("/", (req, res) => {
  res.status(200).send("✅ Lark Bot + Gemini + Lark Base + Firestore is running!");
});

// 🔹 Webhook dari Lark
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event } = req.body;

    // handshake verification
    if (header?.event_type === "url_verification") {
      return res.send({ challenge: req.body.challenge });
    }

    console.log("📩 Event diterima:", header?.event_type);

    // contoh: ambil data dari Lark Base
    const records = await getBaseData();
    console.log(`✅ Lark Base OK: ${records.length} records diambil`);

    // contoh: kirim respons ke Gemini / AI (kalau ada integrasi)
    // const reply = await getGeminiReply(event.text);

    res.status(200).send({
      msg: "✅ Data dari Lark Base berhasil diambil",
      count: records.length,
    });
  } catch (err) {
    console.error("❌ Error di /api/lark:", err.message);
    res.status(500).send({ error: err.message });
  }
});

// 🔹 Jalankan server
app.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});

export default app;
