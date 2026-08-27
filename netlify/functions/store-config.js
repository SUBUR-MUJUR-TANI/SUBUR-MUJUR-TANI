function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "GET") return json(405, { success: false, message: "Method harus GET." });

  // Hanya data identitas toko yang aman ditampilkan pada label.
  // API key dan credential Biteship/Firebase tidak pernah dikirim ke browser.
  const data = {
    name: String(process.env.BITESHIP_ORIGIN_CONTACT_NAME || process.env.BITESHIP_ORIGIN_ORGANIZATION || "SUBUR MUJUR TANI").trim(),
    phone: String(process.env.BITESHIP_ORIGIN_CONTACT_PHONE || "").trim(),
    address: String(process.env.BITESHIP_ORIGIN_ADDRESS || "").trim(),
    postalCode: String(process.env.BITESHIP_ORIGIN_POSTAL_CODE || "").trim()
  };

  return json(200, { success: true, data });
};
