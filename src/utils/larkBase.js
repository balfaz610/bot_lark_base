import axios from "axios";

export async function getTenantAccessToken() {
  try {
    const res = await axios.post(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/",
      {
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      },
      { timeout: 10000 }
    );
    return res.data?.tenant_access_token;
  } catch (err) {
    console.error("❌ Gagal ambil tenant_access_token:", err.response?.data || err.message);
    throw err;
  }
}

export async function getBaseData() {
  const token = await getTenantAccessToken();
  const url = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records`;

  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      return res.data?.data?.items.map((r) => r.fields) || [];
    } catch (err) {
      if (i === 2) {
        console.error("❌ Lark Base error (final):", err.response?.data || err.message);
        throw err;
      }
      console.warn(`⚠️ Lark Base retry (${i + 1})...`);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}
