import express from "express";
import lark from "@larksuiteoapi/node-sdk";
import { getBaseData } from "./utils/larkBase.js";

const app = express();
app.use(express.json());

/** Init Lark client */
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

/** Webhook utama dari Lark */
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event } = req.body;

    // Handle verifikasi URL pertama kali
    if (header?.event_type === "url_verification") {
      return res.send({ challenge: req.body.challenge });
    }

    console.log("📩 Event diterima:", header?.event_type);

    // Ambil data dari Lark Base
    const records = await getBaseData();
    console.log(`✅ Lark Base OK: ${records.length} records diambil`);

    // Coba kirim pesan balasan ke user
    const chatId = event?.message?.chat_id;
    if (chatId) {
      await client.im.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: chatId,
          msg_type: "text",
          content: JSON.stringify({
            text: `📊 Lark Base berhasil dibaca: ${records.length} baris data 🚀`,
          }),
        },
      });
      console.log(`📤 Balasan dikirim ke chat_id: ${chatId}`);
    } else {
      console.warn("⚠️ Tidak ada chat_id di event.message");
    }

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error di /api/lark:", err.message);
    res.status(500).send({ error: err.message });
  }
});

/** Route root */
app.get("/", (req, res) => {
  res.send("🚀 Lark Bot Server is running!");
});

export default app;
