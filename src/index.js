import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import { saveMessage } from "./db.js";

dotenv.config();

const app = express();
app.use(express.json());

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
// 🔹 GEMINI CLIENT
// ====================================================
async function askGemini(prompt) {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { params: { key: process.env.GEMINI_KEY } }
    );
    return (
      res.data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada jawaban dari Gemini."
    );
  } catch (err) {
    console.error("Gemini error:", err.response?.data || err.message);
    return "⚠️ Terjadi error saat memanggil Gemini API.";
  }
}

// ====================================================
// 🔹 KIRIM PESAN KE LARK
// ====================================================
async function sendMessage(chatId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  } catch (err) {
    console.error("Send message error:", err);
  }
}

// ====================================================
// 🔹 AMBIL DATA DARI LARK BASE (FIXED VERSION)
// ====================================================
async function getBaseData() {
  try {
    const baseToken = process.env.LARK_BASE_TOKEN; // ✅ token langsung dari .env

    const res = await axios.get(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records`,
      {
        headers: {
          Authorization: `Bearer ${baseToken}`,
        },
      }
    );

    const records = res.data?.data?.items?.map((item) => item.fields) || [];
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    if (records.length === 0) {
      console.log("⚠️ Tidak ada data di tabel Lark Base.");
    } else {
      console.log(
        `✅ Lark Base loaded: ${records.length} records, kolom: ${columns.join(", ")}`
      );
    }

    return { columns, records };
  } catch (err) {
    console.error("Lark Base error:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}

// ====================================================
// 🔹 MODE: AI REASONING BERDASARKAN TABLE LARK BASE
// ====================================================
async function handleBaseQuery(userMessage) {
  try {
    const { columns, records } = await getBaseData();

    if (records.length === 0) {
      return "⚠️ Tidak ada data di tabel Lark Base.";
    }

    const prompt = `
Kamu adalah AI asisten yang menjawab pertanyaan user HANYA berdasarkan data tabel berikut.
Jangan gunakan pengetahuan umum dari luar data ini.

Nama kolom yang tersedia:
${columns.join(", ")}

Berikut contoh data tabel (maks 50 baris):
${JSON.stringify(records.slice(0, 50), null, 2)}

Pertanyaan user:
"${userMessage}"

Tugas kamu:
1. Analisis data di atas.
2. Jawab hanya jika datanya bisa ditemukan di tabel.
3. Jika tidak ada jawaban yang sesuai, jawab: "Data tidak ditemukan di tabel."
4. Jawab dengan ringkas tapi jelas, boleh dalam bentuk poin atau paragraf singkat.

Jawaban:
`;

    const answer = await askGemini(prompt);
    return answer;
  } catch (err) {
    console.error("handleBaseQuery error:", err);
    return "⚠️ Gagal memproses pertanyaan ke Lark Base.";
  }
}

// ====================================================
// 🔹 LARK WEBHOOK
// ====================================================
app.post("/api/lark", async (req, res) => {
  const body = req.body;
  if (body.type === "url_verification")
    return res.json({ challenge: body.challenge });

  res.status(200).send(); // agar tidak timeout

  try {
    const event = body?.event;
    if (!event?.message) return;

    const message = JSON.parse(event.message.content).text.trim();
    const chatId = event.message.chat_id;
    const sessionId = chatId + "_" + event.sender.sender_id.user_id;

    console.log(`[DEBUG] New message: ${message}`);

    const reply = await handleBaseQuery(message);

    await saveMessage(sessionId, message, reply);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// ====================================================
// 🔹 DEFAULT ROUTE
// ====================================================
app.get("/", (req, res) =>
  res.send("✅ Lark Bot + Gemini + Lark Base + Firestore is running!")
);

// ====================================================
// 🔹 JALANKAN SERVER (untuk lokal)
// ====================================================
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// ====================================================
// 🔹 EXPORT (untuk Vercel)
// ====================================================
export default app;
