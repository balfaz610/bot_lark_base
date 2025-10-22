import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";

dotenv.config();

const app = express();
app.use(express.json());

// ====================================================
// 🔹 Endpoint Tes
// ====================================================
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot Lark Base aktif, bro!");
});

// ====================================================
// 🔹 LARK CLIENT
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 Fungsi Kirim Pesan ke Lark
// ====================================================
async function sendMessage(receiveType, receiveId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: receiveType },
      data: {
        receive_id: receiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
    console.log(`📩 Pesan terkirim ke ${receiveType}: ${receiveId}`);
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.response?.data || err.message);
  }
}

// ====================================================
// 🔹 Webhook Handler (Anti-looping + Safety)
// ====================================================
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event, type, challenge } = req.body;

    // ✅ Verifikasi webhook (dari Lark)
    if (type === "url_verification") {
      console.log("🔗 Verifikasi URL Lark OK!");
      return res.json({ challenge });
    }

    // ✅ Pastikan event adalah pesan
    if (!event || !event.message) {
      console.log("⚠️ Event bukan pesan, dilewati.");
      return res.status(200).send("ignored");
    }

    // 🧠 Anti-looping: skip kalau pengirim adalah bot sendiri
    if (event?.sender?.sender_type === "app") {
      console.log("🛑 Pesan dari bot sendiri diabaikan (anti-loop).");
      return res.status(200).send("ignored");
    }

    // 🔹 Ambil pesan user
    const messageObj = event.message;
    const userMessage = JSON.parse(messageObj.content)?.text?.trim();
    const receiveId = messageObj.chat_id;
    const receiveType = "chat_id";

    if (!userMessage) {
      await sendMessage(receiveType, receiveId, "⚠️ Pesan kosong, bro.");
      return res.status(200).send("no message");
    }

    console.log("💬 Pesan diterima dari user:", userMessage);

    // ====================================================
    // 🔹 Ambil Data dari Lark Base
    // ====================================================
    const { columns, records } = await getBaseData();
    if (!records || records.length === 0) {
      await sendMessage(receiveType, receiveId, "⚠️ Tidak ada data di tabel Lark Base.");
      return res.status(200).send("no data");
    }

    // ====================================================
    // 🔹 Prompt Dinamis (tanpa template kaku)
    // ====================================================
    const prompt = `
Kamu adalah AI asisten yang menjawab pertanyaan berdasarkan data berikut:
Kolom: ${columns.join(", ")}
Data (maks 30 contoh):
${JSON.stringify(records.slice(0, 30), null, 2)}

User bertanya: "${userMessage}"
Jawablah berdasarkan data di atas.
Jika tidak relevan dengan data, jawab: "Data tidak ditemukan di tabel."
Gunakan bahasa Indonesia alami dan santai.
`;

    // ====================================================
    // 🔹 Kirim ke Gemini API
    // ====================================================
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_KEY}`;

    const geminiRes = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
    });

    const reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada respons dari Gemini.";

    console.log("🤖 Balasan Gemini:", reply);

    // ====================================================
    // 🔹 Kirim Balasan ke Chat Lark
    // ====================================================
    await sendMessage(receiveType, receiveId, reply);

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error webhook:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

// ====================================================
// 🔹 Jalankan Lokal
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running di http://localhost:${PORT}`);
  });
}

// ====================================================
// 🔹 Export untuk Vercel
// ====================================================
export default app;
