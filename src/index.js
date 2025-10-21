import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";

dotenv.config();

const app = express();
app.use(express.json());

// ====================================================
// 🔹 Inisialisasi Client Lark
// ====================================================
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// ====================================================
// 🔹 Fungsi Kirim Pesan ke Chat
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
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.response?.data || err.message);
  }
}

// ====================================================
// 🔹 Webhook Lark
// ====================================================
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event, type, challenge } = req.body;

    // ✅ URL verification
    if (type === "url_verification") {
      return res.json({ challenge });
    }

    console.log("📩 Event diterima:", header?.event_type);

    const messageObj = event?.message;
    if (!messageObj) return res.status(200).send();

    const userMessage = JSON.parse(messageObj.content)?.text?.trim();
    if (!userMessage) {
      await sendMessage("chat_id", messageObj.chat_id, "⚠️ Pesan kosong, bro.");
      return res.status(200).send();
    }

    const receiveId = messageObj.chat_id;
    const receiveType = "chat_id";

    // ====================================================
    // 🔹 Ambil Data dari Lark Base
    // ====================================================
    const { columns, records } = await getBaseData();
    if (records.length === 0) {
      await sendMessage(receiveType, receiveId, "⚠️ Tidak ada data di tabel Lark Base.");
      return res.status(200).send();
    }

    // ====================================================
    // 🔹 Buat Prompt ke Gemini
    // ====================================================
    const prompt = `
Kamu adalah asisten AI yang membantu user menelusuri data dari tabel Lark Base.
Gunakan hanya data berikut ini:

Kolom: ${columns.join(", ")}
Data contoh:
${JSON.stringify(records.slice(0, 50), null, 2)}

User bertanya: "${userMessage}"

Tugas kamu:
1. Jawab berdasarkan data di atas (bukan dari pengetahuan umum).
2. Jika tidak ada jawaban yang cocok, balas: "Data tidak ditemukan di tabel."
3. Gunakan Bahasa Indonesia yang natural dan singkat.

Jawaban:
`;

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
      }
    );

    const reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada respons dari Gemini.";

    console.log("🤖 Jawaban Gemini:", reply);

    // ====================================================
    // 🔹 Kirim Jawaban ke Chat
    // ====================================================
    await sendMessage(receiveType, receiveId, reply);

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error webhook:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

// ====================================================
// 🔹 Default Route
// ====================================================
app.get("/", (req, res) => {
  res.send("✅ Lark Bot + Gemini + Lark Base sudah jalan bro!");
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
