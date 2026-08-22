// ======================================
// FIREBASE.JS
// SUBUR MUJUR TANI
// ======================================


// ===============================
// CONFIG FIREBASE
// ===============================

const firebaseConfig = {

    apiKey: "AIzaSyCAnApRscAHXJF-NWt3P_BivrvWzGt996U",

    authDomain: "subur-mujur-tani-6ff54.firebaseapp.com",

    databaseURL:
    "https://subur-mujur-tani-6ff54-default-rtdb.asia-southeast1.firebasedatabase.app",

    projectId:
    "subur-mujur-tani-6ff54",

    storageBucket:
    "subur-mujur-tani-6ff54.firebasestorage.app",

    messagingSenderId:
    "338009458768",

    appId:
    "1:338009458768:web:c562a610cee4940b856955"

};



// ===============================
// CEK FIREBASE
// ===============================

if(typeof firebase === "undefined"){

    throw new Error(
        "Firebase belum dimuat. Pastikan library Firebase dipasang sebelum firebase.js"
    );

}



// ===============================
// INIT FIREBASE
// ===============================

if(firebase.apps.length === 0){

    if (!firebase.apps.length) {
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
}

}



// ===============================
// SERVICE FIREBASE
// ===============================

const auth = firebase.auth();

const database = firebase.database();

const firestore = firebase.firestore();

const storage = firebase.storage();



// ===============================
// LOGIN ADMIN
// ===============================

function loginAdmin(email,password){


    return auth
    .signInWithEmailAndPassword(
        email,
        password
    )

    .then(()=>{

        window.location.href =
        "admin.html";

    })

    .catch(error=>{

        alert(error.message);

    });


}




// ===============================
// LOGOUT ADMIN
// ===============================

function logoutAdmin(){


    auth.signOut()

    .then(()=>{

        window.location.href =
        "login.html";

    });


}



// ===============================
// CEK STATUS LOGIN
// ===============================

auth.onAuthStateChanged(function(user){

    window.userLogin = user || null;

});





// ===============================
// SIMPAN PRODUK
// ===============================

function simpanProduk(data){


    return database
    .ref("produk")
    .push(data);


}



// ===============================
// AMBIL PRODUK
// ===============================

function loadProduk(callback){


    database
    .ref("produk")
    .on(
        "value",
        snapshot=>{

            callback(
                snapshot.val()
            );

        }
    );


}



// ===============================
// HAPUS PRODUK
// ===============================

function hapusProduk(id){


    return database
    .ref("produk/"+id)
    .remove();


}



// ===============================
// UPDATE PRODUK
// ===============================

function updateProduk(id,data){


    return database
    .ref("produk/"+id)
    .update(data);


}




// ===============================
// SIMPAN PESANAN
// ===============================

function simpanPesanan(data){


    return database
    .ref("pesanan")
    .push({

        ...data,

        status:
        "Menunggu Pembayaran",

        tanggal:
        new Date().toLocaleString("id-ID")

    });


}




// ===============================
// AMBIL PESANAN
// ===============================

function loadPesanan(callback){


    database
    .ref("pesanan")
    .on(
        "value",
        snapshot=>{

            callback(
                snapshot.val()
            );

        }
    );


}




// ===============================
// UPDATE STATUS PESANAN
// ===============================

function updateStatusPesanan(id,status){


    return database
    .ref("pesanan/"+id)
    .update({

        status:status

    });


}





// ===============================
// UPLOAD GAMBAR
// ===============================

function uploadGambar(file){


    let namaFile =
    "gambar/"+Date.now()+"_"+file.name;


    return storage
    .ref(namaFile)
    .put(file)

    .then(snapshot=>{

        return snapshot.ref.getDownloadURL();

    });


}





// ===============================
// EXPORT GLOBAL
// ===============================

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


    uploadGambar


};