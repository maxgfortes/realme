import { getDoc, doc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function atualizarMarqueeUltimoUsuario() {
  const marquee = document.querySelector(".marquee");
  if (!marquee) return;

  // Busca usuário mais recente
  const lastUpdateRef = doc(db, "lastupdate", "latestUser");
  const docSnap = await getDoc(lastUpdateRef);
  let mensagens = [];
  if (docSnap.exists()) {
    const data = docSnap.data();
    const nomeUsuario = data.username || "Usuário";
    mensagens.push(`${nomeUsuario} acabou de entrar no RealMe!`);
  } else {
    mensagens.push("Bem-vindo ao RealMe!");
  }

  // Busca mensagens do servidor
  const msgQuery = query(collection(db, "server_message"), orderBy("time", "asc"));
  const msgSnap = await getDocs(msgQuery);
  msgSnap.forEach(doc => {
    const data = doc.data();
    if (data.message && data.time !== undefined) {
      mensagens.push(`msg servidor ${data.time}: ${data.message}`);
    }
  });

  // Função para animar e trocar mensagens
  let idx = 0;
  function mostrarMensagem() {
    marquee.textContent = mensagens[idx];
    marquee.classList.remove('marquee-anim');
    // Força reflow para reiniciar animação
    void marquee.offsetWidth;
    marquee.classList.add('marquee-anim');
    idx = (idx + 1) % mensagens.length;
  }

  // Inicia e troca a cada fim de animação
  marquee.addEventListener('animationend', mostrarMensagem);

  // Adiciona a animação CSS se não existir
  if (!document.getElementById('marquee-anim-css')) {
    const style = document.createElement('style');
    style.id = 'marquee-anim-css';
    style.textContent = `
      .marquee {
        overflow: hidden;
        white-space: nowrap;
        display: block;
        width: 100%;
      }
      .marquee-anim {
        animation: marquee-scroll 8s linear;
      }
      @keyframes marquee-scroll {
        0% { transform: translateX(100%); }
        100% { transform: translateX(-100%); }
      }
    `;
    document.head.appendChild(style);
  }

  // Mostra a primeira mensagem
  mostrarMensagem();
}

document.addEventListener('DOMContentLoaded', atualizarMarqueeUltimoUsuario);