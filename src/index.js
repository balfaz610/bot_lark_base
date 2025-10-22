import express from "express";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import dotenv from "dotenv";
import { getBaseData } from "./utils/larkBase.js";
import { saveMessage, getMessages } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

// Cache untuk debounce
const messageCache = new Map();

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
// 🔹 Kirim Pesan Balasan ke Lark
// ====================================================
async function sendMessage(receiveType, receiveId, text, messageId) {
  try {
    const response = await client.im.message.create({
      params: { receive_id_type: receiveType },
      data: {
        receive_id: receiveId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
    console.log(`✅ Pesan terkirim ke ${receiveId}: ${text}`);
    // Simpan pesan ke Firestore
    await saveMessage(receiveId, text, text, messageId);
    return response;
  } catch (err) {
    console.error("❌ Gagal kirim pesan:", err.response?.data || err.message);
    throw err;
  }
}

// ====================================================
// 🔹 Webhook Handler
// ====================================================
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event, type, challenge } = req.body;
    console.log("📥 Event diterima:", JSON.stringify(event, null, 2));

    // ✅ Validasi URL Webhook
    if (type === "url_verification") {
      console.log("✅ URL verification, challenge:", challenge);
      return res.json({ challenge });
    }

    const messageObj = event?.message;
    if (!messageObj) {
      console.log("⚠️ Tidak ada messageObj di event");
      return res.status(200).send();
    }

    // 🔹 Filter pesan dari bot sendiri
    const sender = event?.sender;
    if (sender?.sender_type === "bot" || sender?.sender_id?.open_id === process.env.LARK_BOT_ID) {
      console.log("⚠️ Skip pesan dari bot sendiri, sender_id:", sender?.sender_id?.open_id);
      return res.status(200).send();
    }

    // 🔹 Cek tipe chat (grup atau P2P)
    const chatType = messageObj.chat_type;
    if (!["group", "p2p"].includes(chatType)) {
      console.log("⚠️ Chat type tidak valid:", chatType);
      return res.status(200).send();
    }

    // 🔹 Cek duplikat pesan
    const messageId = messageObj.message_id;
    const cacheKey = `${messageObj.chat_id}:${messageId}`;
    if (messageCache.has(cacheKey)) {
      console.log("⚠️ Skip pesan duplikat, message_id:", messageId);
      return res.status(200).send();
    }
    messageCache.set(cacheKey, Date.now());
    // Hapus cache setelah 5 menit
    setTimeout(() => messageCache.delete(cacheKey), 5 * 60 * 1000);

    // 🔹 Cek riwayat di Firestore
    const prevMessages = await getMessages(messageObj.chat_id);
    if (prevMessages.some((msg) => msg.messageId === messageId)) {
      console.log("⚠️ Pesan sudah diproses sebelumnya, message_id:", messageId);
      return res.status(200).send();
    }

    const userMessage = JSON.parse(messageObj.content)?.text?.trim();
    const receiveId = messageObj.chat_id;
    const receiveType = "chat_id";

    if (!userMessage) {
      console.log("⚠️ Pesan kosong dari user");
      await sendMessage(receiveType, receiveId, "⚠️ Pesan kosong, bro.", messageId);
      return res.status(200).send();
    }

    // 🔹 Ambil data dari Lark Base
    const { columns, records } = await getBaseData();
    if (records.length === 0) {
      console.log("⚠️ Tidak ada data di Lark Base");
      await sendMessage(receiveType, receiveId, "⚠️ Tidak ada data di tabel Lark Base.", messageId);
      return res.status(200).send();
    }

    // 🔹 Prompt dinamis
    const prompt = `
Kamu adalah AI asisten yang HANYA menjawab berdasarkan data berikut:
Kolom: ${columns.join(", ")}
Data (maks 30 contoh):
${JSON.stringify(records.slice(0, 30), null, 2)}

User bertanya: "${userMessage}"
Jawab HANYA berdasarkan data di atas. Jika tidak relevan, jawab: "Data tidak ditemukan di tabel." Jangan tambah info lain.
Gunakan bahasa Indonesia alami dan santai.
`;

    // 🔹 Kirim ke Gemini API
    console.log("📤 Mengirim prompt ke Gemini:", prompt);
    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] }
    );

    const reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada respons dari Gemini.";
    console.log("📥 Respons Gemini:", reply);

    await sendMessage(receiveType, receiveId, reply, messageId);
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