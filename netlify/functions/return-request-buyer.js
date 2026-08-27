const { getFirebaseAdmin } = require("./firebaseAdmin");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, {success:false,message:"Method harus POST."});
  try {
    const input = JSON.parse(event.body || "{}");
    const invoice = String(input.invoice || "").trim().toUpperCase();
    const last4 = String(input.whatsappLast4 || "").replace(/\D/g,"").slice(-4);
    const reason = String(input.reason || "").trim();
    const note = String(input.note || "").trim().slice(0,1000);
    const refundType = String(input.refundType || "refund_penuh").trim();
    if (!invoice || !/^\d{4}$/.test(last4) || !reason) {
      return json(400,{success:false,message:"Invoice, 4 digit terakhir WhatsApp, dan alasan wajib diisi."});
    }
    const admin = getFirebaseAdmin(), db = admin.database();
    const snap = await db.ref("pesanan").orderByChild("invoice").equalTo(invoice).once("value");
    let orderId="", order=null;
    snap.forEach(c=>{ if(!order){orderId=c.key;order=c.val();} });
    if(!order) return json(404,{success:false,message:"Pesanan tidak ditemukan."});
    const ownerLast4=String(order.whatsapp||"").replace(/\D/g,"").slice(-4);
    if(ownerLast4!==last4) return json(403,{success:false,message:"Verifikasi pesanan tidak cocok."});
    const status=String(order.status||"").trim();
    if(!["Selesai","Beri Penilaian"].includes(status)) {
      return json(400,{success:false,message:"Pengembalian hanya dapat diajukan setelah pesanan diterima/selesai."});
    }
    const existing=await db.ref("pengembalian").orderByChild("invoice").equalTo(invoice).once("value");
    let duplicate=false; existing.forEach(c=>{ if(["Diajukan","Menunggu Pengembalian","Pengembalian Diterima"].includes(String(c.val()?.status||""))) duplicate=true; });
    if(duplicate) return json(409,{success:false,message:"Pengajuan pengembalian untuk pesanan ini sudah ada dan masih diproses."});
    const now=new Date().toLocaleString("id-ID");
    const id=invoice+"-"+Date.now();
    const req={
      id, invoice, orderId, nama:String(order.nama||""), whatsapp:String(order.whatsapp||""),
      total:Number(order.total||0), refundType, reason, note,
      status:"Diajukan", diajukanOleh:"Pembeli", diajukanPada:now,
      buktiStatus:"Belum Diunggah", refundStatus:"Belum Diproses",
      updatedAt:now
    };
    await db.ref("pengembalian/"+id).set(req);
    await db.ref("pesanan/"+orderId).update({
      statusPengembalian:"Diajukan",
      pengembalianId:id,
      pengembalianPada:now,
      pengembalianAlasan:reason
    });
    if(order.invoice) await db.ref("pelacakan/"+order.invoice).update({statusPengembalian:"Diajukan",pengembalianId:id,updatedAt:now});
    return json(200,{success:true,message:"Pengajuan pengembalian berhasil dikirim.",requestId:id,status:"Diajukan"});
  } catch(e) {
    console.error("buyer-return-request:",e);
    return json(500,{success:false,message:e.message||"Gagal mengajukan pengembalian."});
  }
};
