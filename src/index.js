import express from "express";
import lark from "@larksuiteoapi/node-sdk";
import axios from "axios";
import { getBaseData } from "./utils/larkBase.js";

const app = express();
app.use(express.json());

const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// 🔹 Kirim pesan ke Lark chat
async function sendMessage(receiveType, receiveId, text) {
  await client.im.message.create({
    params: { receive_id_type: receiveType },
    data: {
      receive_id: receiveId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    },
  });
}

// 🔹 Webhook utama dari Lark
app.post("/api/lark", async (req, res) => {
  try {
    const { header, event } = req.body;

    if (header?.event_type === "url_verification") {
      return res.send({ challenge: req.body.challenge });
    }

    console.log("📩 Event diterima:", header?.event_type);

    const userMessage = event?.message?.content
      ? JSON.parse(event.message.content).text
      : "";

    const receiveId =
      event?.message?.chat_id ||
      event?.message?.open_chat_id ||
      event?.sender?.sender_id?.open_id;
    const receiveType = event?.message?.chat_id
      ? "chat_id"
      : event?.message?.open_chat_id
      ? "open_chat_id"
      : "open_id";

    if (!userMessage) {
      await sendMessage(receiveType, receiveId, "⚠️ Pesan kosong, bro.");
      return res.status(200).send();
    }

    // 🔹 Ambil data dari Lark Base
    const data = await getBaseData();
    console.log(`📦 Data Lark Base terambil: ${data.length} record`);

    // 🔹 Prompt ke Gemini
    const prompt = `
Kamu adalah asisten untuk memfilter data array JavaScript bernama "data".
Balas HANYA dengan satu baris kode JavaScript valid.
Contoh balasan yang BENAR:
return data.filter(p => p.Jenis_Kelamin === "Perempuan");

Contoh balasan yang SALAH:
"Tentu! Berikut hasilnya..." ❌
`;

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        contents: [
          {
            parts: [
              { text: prompt },
              { text: `Perintah user: ${userMessage}` },
            ],
          },
        ],
      }
    );

    // 🔹 Ambil kode dari Gemini
    let codeBlock =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Bersihin kode supaya gak ada kalimat tambahan
    const cleanCode = codeBlock
      .replace(/```(js|javascript)?/gi, "")
      .replace(/```/g, "")
      .replace(/^.*return/, "return") // ambil dari kata return
      .split("\n")[0] // ambil baris pertama aja
      .trim();

    console.log("🧠 Kode filter dari Gemini:", cleanCode);

    let hasil = [];
    try {
      const fn = new Function("data", cleanCode);
      hasil = fn(data);
    } catch (err) {
      console.error("⚠️ Gagal evaluasi filter:", err.message);
      await sendMessage(receiveType, receiveId, "⚠️ Instruksi tidak valid. Coba ulangi dengan kalimat lain.");
      return res.status(200).send();
    }

    // 🔹 Kirim hasil balik
    if (!hasil?.length) {
      await sendMessage(receiveType, receiveId, "Tidak ada data yang cocok, bro 😅");
    } else {
      const teks = hasil
        .slice(0, 5)
        .map((p, i) => `${i + 1}. ${p.Nama} (${p.Jenis_Kelamin}, ${p.Umur})`)
        .join("\n");
      await sendMessage(receiveType, receiveId, `📊 Hasil pencarian:\n${teks}`);
    }

    res.status(200).send({ ok: true });
  } catch (err) {
    console.error("❌ Error /api/lark:", err.response?.data || err.message);
    res.status(500).send({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.send("🤖 Lark-Gemini Bot siap bantu filter data dari Lark Base!");
});

export default app;
