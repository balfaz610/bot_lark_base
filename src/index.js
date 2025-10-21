import express from "express";
import lark from "@larksuiteoapi/node-sdk";
import { getBaseData } from "./utils/larkBase.js";

const app = express();
app.use(express.json());

/** 🔹 Inisialisasi Lark Client */
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

/** 🔹 Webhook utama dari Lark */
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event } = req.body;

    // Handle verifikasi URL dari Lark
    if (header?.event_type === "url_verification") {
      return res.send({ challenge: req.body.challenge });
    }

    console.log("📩 Event diterima:", header?.event_type);

    // Ambil data dari Lark Base
    const records = await getBaseData();
    console.log(`✅ Lark Base OK: ${records.length} records diambil`);

    /** ============================
     *  Kirim Pesan Balasan ke User
     * ============================ */
    try {
      // Ambil ID penerima dari berbagai kemungkinan (chat_id, open_chat_id, open_id)
      const receiveId =
        event?.message?.chat_id ||
        event?.message?.open_chat_id ||
        event?.sender?.sender_id?.open_id;

      const receiveType = event?.message?.chat_id
        ? "chat_id"
        : event?.message?.open_chat_id
        ? "open_chat_id"
        : "open_id";

      if (!receiveId) {
        console.warn("⚠️ Tidak ada receive_id yang valid, pesan tidak dikirim.");
      } else {
        await client.im.message.create({
          params: { receive_id_type: receiveType },
          data: {
            receive_id: receiveId,
            msg_type: "text",
            content: JSON.stringify({
              text: `📊 Lark Base berhasil dibaca: ${records.length} baris data 🚀`,
            }),
          },
        });
        console.log(`📤 Balasan dikirim ke ${receiveType}: ${receiveId}`);
      }
    } catch (sendErr) {
      console.error("❌ Gagal kirim pesan:", sendErr.response?.data || sendErr.message);
    }

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error di /api/lark:", err.message);
    res.status(500).send({ error: err.message });
  }
});

/** 🔹 Root route (tes server) */
app.get("/", (req, res) => {
  res.send("🚀 Lark Bot Server is running and connected to Lark Base!");
});

export default app;
