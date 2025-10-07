// 🔐 Troque aqui pelas suas credenciais do Firebase
const firebaseConfig = {
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_DOMINIO.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_BUCKET.appspot.com",
  messagingSenderId: "SEU_ID",
  appId: "SEU_APP_ID"
};

// Inicializa o Firebase (apenas uma vez)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Quando o usuário logar ou ao abrir a página
auth.onAuthStateChanged(async (user) => {
  // Elementos do seu HTML (com IDs extras que não quebram o estilo)
  const greetingEl = document.getElementById('greeting');
  const usernameEl = document.getElementById('username');
  const marqueeEl = document.getElementById('marquee');
  const onlineGrid = document.getElementById('onlineFriendsGrid');

  if (user) {
// ADICIONE MAIS FUNÇÕES AQUI (modal, nudge, etc.)
  function saudacaoDinamica() {
    const agora = new Date();
    const hora = agora.getHours();
    let saudacao = "Olá";

    if (hora >= 5 && hora < 12) {
      saudacao = "Bom Dia";
    } else if (hora >= 12 && hora < 18) {
      saudacao = "Boa Tarde";
    } else {
      saudacao = "Boa Noite";
    }

    document.getElementById("greeting").textContent = saudacao;
  }
}


    // Carrega a novidade mais recente
    try {
      const snapshot = await db.collection('news').orderBy('createdAt','desc').limit(1).get();
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        marqueeEl.textContent = data.title;
      } else {
        marqueeEl.textContent = 'Nenhuma novidade no momento';
      }
    } catch {
      marqueeEl.textContent = 'Nenhuma novidade no momento';
    }

    // Carrega amigos online
    onlineGrid.innerHTML = '';
    try {
      const snap2 = await db.collection('users').where('online','==',true).get();
      if (!snap2.empty) {
        snap2.forEach(doc => {
          const d = doc.data();
          onlineGrid.insertAdjacentHTML('beforeend', `
            <div class="online-user">
              <img src="${d.photoURL||'src/icon/default.png'}" class="avatar">
              <div class="online-user-meta"><strong>${d.displayName||'Amigo(a)'}</strong></div>
            </div>`);
        });
      } else {
        onlineGrid.innerHTML = '<p>Nenhum amigo online</p>';
      }
    } catch {
      onlineGrid.innerHTML = '<p>Nenhum amigo online</p>';
    }

);
