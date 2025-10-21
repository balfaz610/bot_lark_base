// src/utils/larkBase.js
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

// ✅ Fungsi ambil tenant access token
async function getTenantAccessToken() {
  const url = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal/";
  const { data } = await axios.post(url, {
    app_id: process.env.LARK_APP_ID,
    app_secret: process.env.LARK_APP_SECRET,
  });
  return data.tenant_access_token;
}

// ✅ Fungsi ambil data dari Lark Base
export async function getBaseData() {
  try {
    const token = await getTenantAccessToken();

    const baseUrl = `https://open.larksuite.com/open-apis/bitable/v1/apps/${process.env.LARK_BASE_APP_TOKEN}/tables/${process.env.LARK_BASE_TABLE_ID}/records`;

    const res = await axios.get(baseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const records = res.data?.data?.items || [];

    const data = records.map((r) => {
      const fields = r.fields || {};
      return fields;
    });

    const allColumns = Array.from(
      new Set(
        data.flatMap((obj) => Object.keys(obj))
      )
    );

    return { columns: allColumns, records: data };
  } catch (err) {
    console.error("❌ Gagal ambil data dari Lark Base:", err.response?.data || err.message);
    return { columns: [], records: [] };
  }
}
