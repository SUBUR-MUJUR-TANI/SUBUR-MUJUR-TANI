// ======================================
// FIREBASE.JS - SUBUR MUJUR TANI
// ======================================

const firebaseConfig = {
    apiKey: "AIzaSyCAnApRscAHXJF-NWt3P_BivrvWzGt996U",
    authDomain: "subur-mujur-tani-6ff54.firebaseapp.com",
    databaseURL: "https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "subur-mujur-tani-6ff54",
    storageBucket: "subur-mujur-tani-6ff54.firebasestorage.app",
    messagingSenderId: "338009458768",
    appId: "1:338009458768:web:c562a610cee4940b856955"
};

if (typeof firebase === "undefined") {
    console.error("Firebase belum dimuat.");
} else {
    if (firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
}

const auth = firebase.auth();
const database = firebase.database();
const firestore = (typeof firebase.firestore === "function") ? firebase.firestore() : null;
const storage = (typeof firebase.storage === "function") ? firebase.storage() : null;

// Pastikan service Firebase juga tersedia melalui window.
// Ini mencegah fungsi checkout/stock gagal karena perbedaan scope script.
window.FirebaseApp = window.FirebaseApp || {};
window.FirebaseApp.auth = auth;
window.FirebaseApp.database = database;
window.FirebaseApp.firestore = firestore;
window.FirebaseApp.storage = storage;
window.database = database;
window.auth = auth;

function loginAdmin(email, password) {
    return auth.signInWithEmailAndPassword(email, password)
        .then(() => { window.location.href = "admin.html"; })
        .catch(error => { alert(error.message); });
}

function logoutAdmin() {
    return auth.signOut().then(() => {
        window.location.href = "login.html";
    });
}

auth.onAuthStateChanged(function(user) {
    window.userLogin = user || null;
});

function simpanProduk(data) {
    return database.ref("produk").push(data);
}

function loadProduk(callback) {
    database.ref("produk").on("value", snapshot => callback(snapshot.val()));
}

function hapusProduk(id) {
    return database.ref("produk/" + id).remove();
}

function updateProduk(id, data) {
    return database.ref("produk/" + id).update(data);
}

function simpanPesanan(data) {
    return database.ref("pesanan").push({
        ...data,
        status: "Menunggu Pembayaran",
        tanggal: new Date().toLocaleString("id-ID")
    });
}

function loadPesanan(callback) {
    database.ref("pesanan").on("value", snapshot => callback(snapshot.val()));
}

function updateStatusPesanan(id, status) {
    return database.ref("pesanan/" + id).update({status: status});
}

function uploadGambar(file) {
    const namaFile = "gambar/" + Date.now() + "_" + file.name;
    return storage.ref(namaFile).put(file)
        .then(snapshot => snapshot.ref.getDownloadURL());
}

async function uploadBuktiPembayaranFirebase(file, namaPembeli, paymentId) {
    if (!file) throw new Error("File bukti transfer belum dipilih.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || "")) throw new Error("Bukti transfer harus JPG, PNG, atau WEBP.");
    if (Number(file.size || 0) > 5 * 1024 * 1024) throw new Error("Ukuran bukti transfer maksimal 5 MB.");
    if (!paymentId) throw new Error("ID pembayaran belum tersedia.");

    // Bukti transfer TIDAK lagi disimpan di Firebase Storage.
    // File dikirim ke Netlify Function lalu disimpan di Netlify Blobs.
    // Ini menjaga project Firebase tetap di paket gratis/Spark.
    const form = new FormData();
    form.append("file", file, file.name || "bukti-transfer");
    form.append("paymentId", paymentId);
    form.append("namaPembeli", namaPembeli || "pembeli");

    const response = await fetch("/.netlify/functions/upload-bukti-transfer", {
        method: "POST",
        body: form
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok || !data || !data.url) {
        throw new Error((data && data.error) || "Upload bukti transfer gagal.");
    }
    return data.url;
}

window.FirebaseApp = {
    auth,
    database,
    firestore,
    storage,
    loginAdmin,
    logoutAdmin,
    simpanProduk,
    loadProduk,
    hapusProduk,
    updateProduk,
    simpanPesanan,
    loadPesanan,
    updateStatusPesanan,
    uploadGambar,
    uploadBuktiPembayaranFirebase
};
