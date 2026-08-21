
/* =========================================================
   SUBUR MUJUR TANI — FITUR TOKO TAMBAHAN
   Voucher, minimum pembelian, riwayat/status pesanan,
   tracking, dan WhatsApp.
========================================================= */
(function () {
  "use strict";

  // Ambil instance Realtime Database dari semua jalur yang mungkin.
  // admin.html memakai const database (global lexical scope), yang tidak
  // otomatis menjadi window.database. Karena itu fallback ke firebase.database().
  const db = () => {
    try {
      if (window.FirebaseApp && window.FirebaseApp.database) return window.FirebaseApp.database;
    } catch (_) {}
    try {
      if (window.database) return window.database;
    } catch (_) {}
    try {
      if (typeof firebase !== "undefined" && firebase.apps && firebase.apps.length) {
        return firebase.database();
      }
    } catch (_) {}
    return null;
  };
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const rupiah = (n) => Number(n || 0).toLocaleString("id-ID");
  const now = () => new Date().toLocaleString("id-ID");
  // checkout.html mendeklarasikan keranjang/ongkir sebagai global var.
  // Jangan hanya membaca window.* karena versi lama memakai let sehingga
  // nilainya berada di global lexical scope dan bukan property window.
  const getCart = () => {
    try {
      if (typeof keranjang !== "undefined" && Array.isArray(keranjang)) return keranjang;
    } catch (_) {}
    return Array.isArray(window.keranjang) ? window.keranjang : [];
  };
  const getOngkir = () => {
    try {
      if (typeof ongkir !== "undefined" && Number.isFinite(Number(ongkir))) return Number(ongkir);
    } catch (_) {}
    return Number(window.ongkir || localStorage.getItem("smt_ongkir") || 0);
  };

  /* =========================
     VOUCHER CHECKOUT
  ========================= */
  let voucher = {
    code: "",
    type: "percent",
    value: 0,
    minPurchase: 0,
    maxDiscount: 0,
    discount: 0,
    expiresAt: "",
    active: true
  };

  function productTotal() {
    return getCart().reduce((sum, item) => {
      // Gunakan helper checkout jika tersedia agar harga lama/stale/format
      // rupiah tetap dihitung sama dengan Ringkasan Pembayaran utama.
      let harga = 0;
      try {
        if (typeof hargaItem === "function") harga = Number(hargaItem(item)?.harga || 0);
        else harga = Number(item.harga || 0);
      } catch (_) {
        harga = Number(item.harga || 0);
      }
      const jumlah = Math.max(1, Number(item.jumlah || item.qty || item.quantity || 1));
      return sum + Math.max(0, harga) * jumlah;
    }, 0);
  }

  function calculateVoucherDiscount(v) {
    const subtotal = productTotal();
    if (!v || !v.active || !v.code || subtotal < Number(v.minPurchase || 0)) return 0;
    let d = v.type === "fixed"
      ? Number(v.value || 0)
      : Math.round(subtotal * Number(v.value || 0) / 100);
    if (Number(v.maxDiscount || 0) > 0) d = Math.min(d, Number(v.maxDiscount));
    return Math.max(0, Math.min(d, subtotal));
  }

  function isExpired(v) {
    if (!v || !v.expiresAt) return false;
    return new Date(v.expiresAt).getTime() < Date.now();
  }

  function setVoucherMessage(message, ok) {
    const el = document.getElementById("voucherMessage");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = ok ? "#1b5e20" : "#c62828";
  }

  async function terapkanVoucher() {
    const input = document.getElementById("voucherCode");
    const code = (input?.value || "").trim().toUpperCase();
    if (!code) {
      voucher = {code:"",type:"percent",value:0,minPurchase:0,maxDiscount:0,discount:0,expiresAt:"",active:true};
      setVoucherMessage("Masukkan kode voucher.", false);
      updateTotalsWithVoucher();
      return;
    }

    const database = db();
    if (!database) {
      setVoucherMessage("Firebase belum siap. Refresh halaman.", false);
      return;
    }

    try {
      const snap = await database.ref("voucher").child(code).once("value");
      if (!snap.exists()) {
        voucher = {code:"",type:"percent",value:0,minPurchase:0,maxDiscount:0,discount:0,expiresAt:"",active:true};
        setVoucherMessage("❌ Voucher tidak ditemukan.", false);
        updateTotalsWithVoucher();
        return;
      }

      const v = snap.val() || {};
      v.code = code;
      v.active = v.active !== false;

      if (!v.active) throw new Error("Voucher sedang tidak aktif.");
      if (isExpired(v)) throw new Error("Voucher sudah kedaluwarsa.");

      const subtotal = productTotal();
      const min = Number(v.minPurchase || 0);
      if (subtotal < min) {
        throw new Error("Minimum pembelian voucher Rp " + rupiah(min) + ".");
      }

      const discount = calculateVoucherDiscount(v);
      if (discount <= 0) throw new Error("Voucher tidak memberikan potongan.");

      voucher = {
        code,
        type: v.type === "fixed" ? "fixed" : "percent",
        value: Number(v.value || 0),
        minPurchase: min,
        maxDiscount: Number(v.maxDiscount || 0),
        discount,
        expiresAt: v.expiresAt || "",
        active: true
      };

      setVoucherMessage(
        `✅ Voucher ${code} berhasil. Hemat Rp ${rupiah(discount)}.`,
        true
      );
      updateTotalsWithVoucher();
    } catch (e) {
      voucher = {code:"",type:"percent",value:0,minPurchase:0,maxDiscount:0,discount:0,expiresAt:"",active:true};
      setVoucherMessage("❌ " + (e.message || "Voucher tidak dapat digunakan."), false);
      updateTotalsWithVoucher();
    }
  }

  function updateTotalsWithVoucher() {
    const subtotal = productTotal();
    const voucherDiscount = calculateVoucherDiscount(voucher);
    voucher.discount = voucherDiscount;
    const total = Math.max(0, subtotal + getOngkir() - voucherDiscount);

    const a = document.getElementById("totalProduk");
    const b = document.getElementById("totalOngkir");
    const c = document.getElementById("totalBayar");
    const d = document.getElementById("totalVoucher");
    if (a) a.textContent = rupiah(subtotal);
    if (b) b.textContent = rupiah(getOngkir());
    if (d) d.textContent = rupiah(voucherDiscount);
    if (c) c.textContent = rupiah(total);

    const box = document.getElementById("voucherApplied");
    if (box) {
      box.textContent = voucherDiscount > 0
        ? `Voucher ${voucher.code}: -Rp ${rupiah(voucherDiscount)}`
        : "Belum ada voucher.";
    }
  }

  /* Override total calculation used by existing checkout save function. */
  const oldFinalGetTotals = window.finalGetTotals;
  window.finalGetTotals = function () {
    const base = typeof oldFinalGetTotals === "function"
      ? oldFinalGetTotals()
      : {totalProduk: productTotal(), ongkir:getOngkir(), total:productTotal()+getOngkir()};
    const d = calculateVoucherDiscount(voucher);
    voucher.discount = d;
    return {
      totalProduk: Number(base.totalProduk || 0),
      ongkir: Number(base.ongkir || 0),
      totalVoucher: d,
      total: Math.max(0, Number(base.totalProduk || 0) + Number(base.ongkir || 0) - d)
    };
  };

  const oldUpdateTotalBayar = window.updateTotalBayar;
  window.updateTotalBayar = function () {
    if (typeof oldUpdateTotalBayar === "function") oldUpdateTotalBayar();
    updateTotalsWithVoucher();
  };

  /* =========================
     RIWAYAT PESANAN
  ========================= */
  function readHistory() {
    try {
      const x = JSON.parse(localStorage.getItem("smt_order_history") || "[]");
      return Array.isArray(x) ? x : [];
    } catch (_) { return []; }
  }

  function saveHistory(item) {
    const list = readHistory().filter(x => x.invoice !== item.invoice);
    list.unshift(item);
    localStorage.setItem("smt_order_history", JSON.stringify(list.slice(0, 20)));
  }

  function renderHistory() {
    const box = document.getElementById("riwayatPesanan");
    if (!box) return;
    const list = readHistory();
    if (!list.length) {
      box.innerHTML = "<p>Belum ada riwayat pesanan di perangkat ini.</p>";
      return;
    }
    box.innerHTML = list.map((o, i) => `
      <div style="border:1px solid #ddd;border-radius:12px;padding:14px;margin:10px 0">
        <b>${esc(o.invoice || "-")}</b>
        <div>${esc(o.tanggal || "")}</div>
        <div>Status: <b>${esc(o.status || "Menunggu Pembayaran")}</b></div>
        <div>Total: <b>Rp ${rupiah(o.total)}</b></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button type="button" onclick="fiturCekStatus('${esc(o.invoice || "")}')">🔎 Cek Status</button>
          <button type="button" onclick="fiturWhatsAppStatus(${i})">💬 WhatsApp</button>
          ${!["Dikirim","Selesai","Dibatalkan","Dikembalikan"].includes(String(o.status || "").trim())
            ? `<button type="button" onclick="fiturBatalkanPesanan(${i})" style="background:#fff0f0;color:#b42318;border:1px solid #f0b4b4;border-radius:8px;padding:8px 11px;font-weight:700">❌ Batalkan Pesanan</button>`
            : ""}
          ${["Selesai","Beri Penilaian"].includes(String(o.status || "").trim())
            ? `<button type="button" onclick="fiturAjukanPengembalian(${i})" style="background:#fff8e1;color:#8a5a00;border:1px solid #e7c66b;border-radius:8px;padding:8px 11px;font-weight:700">🔄 Ajukan Pengembalian</button>`
            : ""}
        </div>
      </div>
    `).join("");
  }

  async function cekStatus() {
    const invoice = (document.getElementById("trackingInvoice")?.value || "").trim().toUpperCase();
    const last4 = (document.getElementById("trackingLast4")?.value || "").trim();
    const box = document.getElementById("hasilTracking");
    if (!invoice || !last4) {
      if (box) box.innerHTML = "Isi nomor invoice dan 4 digit terakhir WhatsApp.";
      return;
    }
    if (!/^\d{4}$/.test(last4)) {
      if (box) box.innerHTML = "4 digit terakhir WhatsApp harus angka.";
      return;
    }

    try {
      const snap = await db().ref("pelacakan").child(invoice).once("value");
      if (!snap.exists()) throw new Error("Pesanan tidak ditemukan.");
      const data = snap.val() || {};
      if (String(data.whatsappLast4 || "") !== last4) {
        throw new Error("Data verifikasi tidak cocok.");
      }
      const history = Array.isArray(data.riwayatStatus) ? data.riwayatStatus : [];
      box.innerHTML = `
        <div style="padding:15px;background:#e8f5e9;border-radius:10px">
          <b>Invoice:</b> ${esc(data.invoice)}<br>
          <b>Nama:</b> ${esc(data.nama || "-")}<br>
          <b>Status:</b> <strong>${esc(data.status || "-")}</strong><br>
          <b>Resi:</b> ${esc(data.resi || "Belum tersedia")}<br>
          <b>Terakhir diperbarui:</b> ${esc(data.updatedAt || "-")}
        </div>
        <h4>Riwayat Status</h4>
        ${history.length
          ? history.map(h => `<div style="padding:9px;border-bottom:1px solid #eee"><b>${esc(h.status)}</b><br><small>${esc(h.waktu || "")}</small></div>`).join("")
          : "<p>Belum ada riwayat status.</p>"}
      `;
    } catch (e) {
      if (box) box.innerHTML = `<span style="color:#c62828">❌ ${esc(e.message)}</span>`;
    }
  }

  function fiturCekStatus(invoice) {
    const input = document.getElementById("trackingInvoice");
    if (input) input.value = invoice;
    document.getElementById("trackingBox")?.scrollIntoView({behavior:"smooth"});
  }

  function fiturWhatsAppStatus(index) {
    const list = readHistory();
    const o = list[index];
    if (!o) return;
    const phone = String(o.whatsapp || "").replace(/\D/g, "");
    const target = phone || "62859110011700";
    const text = [
      "🌱 SUBUR MUJUR TANI",
      "Permintaan informasi pesanan",
      "Invoice: " + (o.invoice || "-"),
      "Status terakhir: " + (o.status || "-"),
      "Total: Rp " + rupiah(o.total),
      "",
      "Mohon informasi status pesanan saya."
    ].join("\n");
    window.open("https://wa.me/" + target + "?text=" + encodeURIComponent(text), "_blank");
  }

  /* =========================
     WRAP SIMPAN PESANAN
  ========================= */
  const oldSimpanPesanan = window.simpanPesanan;
  if (typeof oldSimpanPesanan === "function") {
    window.simpanPesanan = async function () {
      if (voucher.code) {
        const d = calculateVoucherDiscount(voucher);
        if (d <= 0) {
          setVoucherMessage("Voucher tidak lagi memenuhi syarat minimum pembelian.", false);
          updateTotalsWithVoucher();
          return;
        }
        voucher.discount = d;
      }

      const before = localStorage.getItem("smt_last_order_id") || "";
      await oldSimpanPesanan();

      const orderId = localStorage.getItem("smt_last_order_id") || "";
      if (!orderId || orderId === before) return;

      try {
        const database = db();
        const snap = await database.ref("pesanan/" + orderId).once("value");
        const order = snap.val();
        if (!order) return;

        const totalVoucher = Number(voucher.discount || 0);
        const extra = {
          voucherCode: voucher.code || "",
          voucherType: voucher.type || "",
          voucherValue: Number(voucher.value || 0),
          totalVoucher: totalVoucher,
          minimumPembelianVoucher: Number(voucher.minPurchase || 0),
          status: order.status || "Menunggu Pembayaran"
        };

        await database.ref("pesanan/" + orderId).update(extra);

        const tracking = {
          invoice: order.invoice,
          nama: order.nama,
          total: Number(order.total || 0),
          status: order.status || "Menunggu Pembayaran",
          resi: order.resi || "",
          whatsappLast4: String(order.whatsapp || "").replace(/\D/g, "").slice(-4),
          updatedAt: now(),
          riwayatStatus: [{
            status: order.status || "Menunggu Pembayaran",
            waktu: now()
          }]
        };
        await database.ref("pelacakan/" + order.invoice).set(tracking);

        saveHistory({
          invoice: order.invoice,
          nama: order.nama,
          whatsapp: order.whatsapp,
          total: Number(order.total || 0),
          status: order.status || "Menunggu Pembayaran",
          tanggal: order.tanggal || now()
        });

        renderHistory();
        const statusBox = document.getElementById("pesananTersimpan");
        if (statusBox) {
          statusBox.innerHTML = `
            <div style="padding:15px;background:#e8f5e9;border-radius:10px">
              ✅ Pesanan <b>${esc(order.invoice)}</b> berhasil disimpan.<br>
              Status: <b>${esc(order.status || "Menunggu Pembayaran")}</b>
              ${totalVoucher ? `<br>Voucher: <b>${esc(voucher.code)}</b> (-Rp ${rupiah(totalVoucher)})` : ""}
            </div>`;
        }
      } catch (e) {
        console.error("Fitur tambahan pesanan:", e);
      }
    };
  }

  const oldCetakInvoice = window.cetakInvoice;
  if (typeof oldCetakInvoice === "function") {
    window.cetakInvoice = function (data) {
      if (data && voucher.code) {
        data = Object.assign({}, data, {
          voucherCode: voucher.code,
          totalVoucher: Number(voucher.discount || 0)
        });
      }
      return oldCetakInvoice(data);
    };
  }

  /* =========================
     PEMBATALAN PESANAN PEMBELI
  ========================= */
  async function fiturBatalkanPesanan(index) {
    const list = readHistory();
    const o = list[index];
    if (!o || !o.invoice) return alert("Data pesanan tidak ditemukan.");

    const current = String(o.status || "Menunggu Pembayaran").trim();
    if (["Dikirim","Selesai","Dibatalkan","Dikembalikan"].includes(current)) {
      return alert("Pesanan dengan status " + current + " tidak dapat dibatalkan.");
    }

    const last4 = String(o.whatsapp || "").replace(/\D/g, "").slice(-4);
    if (!/^\d{4}$/.test(last4)) {
      return alert("Nomor WhatsApp pesanan tidak memiliki 4 digit terakhir yang valid.");
    }

    const ok = confirm(
      "Batalkan pesanan " + o.invoice + "?\n\n" +
      "Pesanan yang sudah diambil kurir tidak dapat dibatalkan."
    );
    if (!ok) return;

    try {
      const r = await fetch("/api/cancel-order-buyer", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({invoice:o.invoice, whatsappLast4:last4})
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok || !data.success) throw new Error(data.message || "Gagal membatalkan pesanan.");

      const updated = readHistory().map(x =>
        x.invoice === o.invoice ? {...x, status:"Dibatalkan", dibatalkanOleh:"Pembeli"} : x
      );
      localStorage.setItem("smt_order_history", JSON.stringify(updated.slice(0,20)));
      renderHistory();
      if (typeof pmSyncOrderStatuses === "function") pmSyncOrderStatuses();
      alert("✅ Pesanan berhasil dibatalkan.");
    } catch (e) {
      alert("❌ " + (e.message || "Gagal membatalkan pesanan."));
    }
  }
  window.fiturBatalkanPesanan = fiturBatalkanPesanan;

  async function fiturAjukanPengembalian(index) {
    const list=readHistory(), o=list[index];
    if(!o || !o.invoice) return alert("Data pesanan tidak ditemukan.");
    const current=String(o.status||"").trim();
    if(!["Selesai","Beri Penilaian"].includes(current)) return alert("Pengembalian hanya dapat diajukan setelah pesanan diterima/selesai.");
    const last4=String(o.whatsapp||"").replace(/\D/g,"").slice(-4);
    if(!/^\d{4}$/.test(last4)) return alert("Nomor WhatsApp pesanan tidak valid.");
    const reason=prompt("Alasan pengembalian:\n1. Barang rusak\n2. Barang tidak sesuai\n3. Barang kurang\n4. Barang salah\n5. Lainnya","Barang rusak");
    if(!reason) return;
    const refundType=prompt("Jenis pengembalian:\n- refund_penuh = pengembalian dana penuh\n- refund_sebagian = pengembalian dana sebagian\n- barang_dan_dana = barang dikembalikan + dana","refund_penuh") || "refund_penuh";
    if(!["refund_penuh","refund_sebagian","barang_dan_dana"].includes(refundType)) return alert("Jenis pengembalian tidak valid.");
    const note=prompt("Keterangan tambahan (opsional):","") || "";
    if(!confirm("Kirim pengajuan pengembalian untuk "+o.invoice+"?")) return;
    try {
      const r=await fetch("/api/return-request-buyer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        invoice:o.invoice, whatsappLast4:last4, reason, refundType, note
      })});
      const data=await r.json().catch(()=>({}));
      if(!r.ok || !data.success) throw new Error(data.message||"Gagal mengajukan pengembalian.");
      const updated=readHistory().map(x=>x.invoice===o.invoice?{...x,statusPengembalian:"Diajukan",pengembalianId:data.requestId}:x);
      localStorage.setItem("smt_order_history",JSON.stringify(updated.slice(0,20)));
      renderHistory();
      alert("✅ Pengajuan pengembalian berhasil dikirim.\nAdmin akan memeriksa dan memprosesnya.");
    } catch(e) { alert("❌ "+(e.message||"Gagal mengajukan pengembalian.")); }
  }
  window.fiturAjukanPengembalian=fiturAjukanPengembalian;

  /* =========================
     ADMIN VOUCHER
  ========================= */
  async function adminSimpanVoucher() {
    // Firebase pada admin sudah diinisialisasi sebelum fitur-toko.js dimuat,
    // tetapi tetap beri waktu singkat bila browser sedang menyelesaikan init.
    let database = db();
    if (!database) {
      for (let i = 0; i < 20 && !database; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        database = db();
      }
    }
    if (!database) return alert("Firebase tidak dapat terhubung. Periksa koneksi internet lalu coba lagi.");
    const codeEl = document.getElementById("voucherAdminCode");
    const code = (codeEl?.value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const type = document.getElementById("voucherAdminType")?.value || "percent";
    const value = Number(document.getElementById("voucherAdminValue")?.value || 0);
    const minPurchase = Number(document.getElementById("voucherAdminMin")?.value || 0);
    const maxDiscount = Number(document.getElementById("voucherAdminMax")?.value || 0);
    const expiresAt = document.getElementById("voucherAdminExpiry")?.value || "";
    const active = document.getElementById("voucherAdminActive")?.checked !== false;

    if (!code) return alert("Kode voucher wajib diisi.");
    if (value <= 0) return alert("Nilai voucher harus lebih dari 0.");
    if (type === "percent" && value > 100) return alert("Diskon persen maksimal 100%.");

    try {
      await database.ref("voucher/" + code).set({
        code, type, value, minPurchase: Math.max(0, minPurchase),
        maxDiscount: Math.max(0, maxDiscount),
        expiresAt, active, updatedAt: now(), waktu: Date.now()
      });
      alert("✅ Voucher " + code + " berhasil disimpan.");
      document.getElementById("voucherAdminCode").value = "";
      document.getElementById("voucherAdminValue").value = "";
      document.getElementById("voucherAdminMin").value = "";
      document.getElementById("voucherAdminMax").value = "";
      document.getElementById("voucherAdminExpiry").value = "";
      loadAdminVouchers();
    } catch (e) {
      alert("❌ Gagal menyimpan voucher: " + e.message);
    }
  }

  async function loadAdminVouchers() {
    const box = document.getElementById("daftarVoucherAdmin");
    if (!box || !db()) return;
    try {
      const snap = await db().ref("voucher").once("value");
      const data = snap.val() || {};
      const ids = Object.keys(data);
      if (!ids.length) {
        box.innerHTML = "<p>Belum ada voucher.</p>";
        return;
      }
      box.innerHTML = ids.sort().map(id => {
        const v = data[id] || {};
        const tipe = v.type === "fixed" ? "Rp " + rupiah(v.value) : v.value + "%";
        return `<div class="card" style="margin-bottom:10px">
          <b>🏷️ ${esc(id)}</b>
          <p>Diskon: ${esc(tipe)}</p>
          <p>Minimum: Rp ${rupiah(v.minPurchase)}</p>
          <p>Maksimal potongan: ${v.maxDiscount ? "Rp " + rupiah(v.maxDiscount) : "Tidak dibatasi"}</p>
          <p>Berlaku sampai: ${esc(v.expiresAt || "Tidak dibatasi")}</p>
          <p>Status: <b>${v.active === false ? "Nonaktif" : "Aktif"}</b></p>
          <button type="button" onclick="adminToggleVoucher('${esc(id)}',${v.active === false ? "true":"false"})">${v.active === false ? "✅ Aktifkan" : "⛔ Nonaktifkan"}</button>
          <button type="button" onclick="adminHapusVoucher('${esc(id)}')" style="background:#c62828">🗑️ Hapus</button>
        </div>`;
      }).join("");
    } catch (e) {
      box.innerHTML = `<p style="color:#c62828">❌ ${esc(e.message)}</p>`;
    }
  }

  async function adminToggleVoucher(id, active) {
    try {
      await db().ref("voucher/" + id).update({active: !!active, updatedAt: now()});
      loadAdminVouchers();
    } catch(e) { alert("Gagal mengubah voucher: " + e.message); }
  }

  async function adminHapusVoucher(id) {
    if (!confirm("Hapus voucher " + id + "?")) return;
    try {
      await db().ref("voucher/" + id).remove();
      loadAdminVouchers();
    } catch(e) { alert("Gagal menghapus voucher: " + e.message); }
  }

  window.terapkanVoucher = terapkanVoucher;
  window.fiturCekStatus = fiturCekStatus;
  window.fiturWhatsAppStatus = fiturWhatsAppStatus;
  window.cekStatusPesanan = cekStatus;
  window.adminSimpanVoucher = adminSimpanVoucher;
  window.loadAdminVouchers = loadAdminVouchers;
  window.adminToggleVoucher = adminToggleVoucher;
  window.adminHapusVoucher = adminHapusVoucher;

  document.addEventListener("DOMContentLoaded", function () {
    if (document.getElementById("voucherCode")) {
      renderHistory();
      updateTotalsWithVoucher();
    }
    if (document.getElementById("daftarVoucherAdmin")) {
      loadAdminVouchers();
    }
  });
})();
