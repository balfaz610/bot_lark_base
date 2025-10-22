import axios from "axios";

let cachedToken = null;
let tokenExpiry = 0;

async function getTenantToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) return cachedToken;

  try {
    const authRes = await axios.post(
      "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
      {
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }
    );

    cachedToken = authRes.data.tenant_access_token;
    tokenExpiry = now + 1000 * 7100; // ~1 jam 58 menit
    return cachedToken;
  } catch (err) {
    console.error("❌ Gagal ambil tenant token:", err.response?.data || err.message);
    throw new Error("Gagal ambil tenant token");
  }
}

export async function getBaseData(limit = 50) {
  try {
    const tenantToken = await getTenantToken();

    const res = await axios.get(
      `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_APP_TOKEN}/tables/${process.env.LARK_TABLE_ID}/records?page_size=${limit}`,
      {
        headers: { Authorization: `Bearer ${tenantToken}` },
      }
    );

    const records = res.data?.data?.items?.map((item) => item.fields) || [];
    const columns = records.length > 0 ? Object.keys(records[0]) : [];

    return { columns, records };
  } catch (err) {
    console.error("❌ Gagal ambil data Lark Base:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}
