import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { buscarUsuarioCached } from './utilities.js';

const db = getFirestore();

export async function contarLikes(postId) {
  const likersRef = collection(db, 'posts', postId, 'likers');
  const q = query(likersRef, where('like', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

export async function toggleLikePost(uid, postId, element) {
  const likerRef = doc(db, `posts/${postId}/likers/${uid}`);

  try {
    const likerSnap = await getDoc(likerRef);
    const spanCurtidas = element.querySelector("span");
    let curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;

    if (likerSnap.exists() && likerSnap.data().like === true) {
      await updateDoc(likerRef, {
        like: false,
        timestamp: Date.now()
      });

      element.classList.remove("liked");
      spanCurtidas.textContent = Math.max(0, curtidasAtuais - 1);
    } else {
      if (likerSnap.exists()) {
        await updateDoc(likerRef, {
          like: true,
          timestamp: Date.now()
        });
      } else {
        await setDoc(likerRef, {
          uid,
          like: true,
          timestamp: Date.now()
        });
      }

      element.classList.add("liked");
      spanCurtidas.textContent = curtidasAtuais + 1;
    }
    atualizarCurtidoPorDepoisDoLike(element, postId);
  } catch (error) {
    console.error("Erro ao curtir/descurtir:", error);
  }
}

export async function atualizarCurtidoPorDepoisDoLike(btn, postId) {
  const auth = (await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js")).getAuth();
  const usuarioLogado = auth.currentUser;
  const footerBox = btn.closest(".post-card").querySelector(".post-footer-box");
  const footer = btn.closest(".post-card").querySelector(".post-liked-by");

  if (!footerBox || !footer || !usuarioLogado) return;

  const info = await gerarTextoCurtidoPor(postId, usuarioLogado.uid);

  if (info.total === 0) {
    footerBox.style.display = "none";
    footer.innerHTML = "";
    return;
  }

  let fotosHTML = '';
  if (info.fotos && info.fotos.length > 0) {
    fotosHTML = '<div style="display: flex; margin-right: 4px;">';
    info.fotos.forEach((foto, index) => {
      fotosHTML += `
        <img 
          src="${foto}" 
          alt="Avatar" 
          style="
            width: 20px; 
            height: 20px; 
            border-radius: 50%; 
            object-fit: cover;
            ${index > 0 ? 'margin-left: -6px;' : ''}
          "
        />
      `;
    });
    fotosHTML += '</div>';
  }

  let textoHTML = '<span>Curtido por ';

  if (info.usernames.length === 1) {
    textoHTML += `<strong>${info.usernames[0]}</strong>`;
  } else if (info.usernames.length >= 2) {
    textoHTML += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  }

  const outros = info.total - info.usernames.length;
  if (outros === 1) {
    textoHTML += ` e outra <strong>1 pessoa</strong>`;
  } else if (outros > 1) {
    textoHTML += ` e outras <strong>${outros} pessoas</strong>`;
  }

  textoHTML += '</span>';

  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "8px";
  footer.innerHTML = fotosHTML + textoHTML;

  footerBox.style.display = "flex";
}

export async function gerarTextoCurtidoPor(postId, usuarioLogadoUid) {
  const likersRef = collection(db, `posts/${postId}/likers`);
  const likersSnap = await getDocs(likersRef);

  const likersTotal = [];
  likersSnap.forEach(d => {
    if (d.data().like === true) {
      likersTotal.push({ uid: d.id, timestamp: d.data().timestamp || 0 });
    }
  });

  const total = likersTotal.length;
  if (total === 0) return { usernames: [], total: 0, fotos: [] };

  if (total === 1 && likersTotal[0].uid === usuarioLogadoUid) {
    const meusDados = await buscarUsuarioCached(usuarioLogadoUid);
    return {
      usernames: ["você"],
      total,
      fotos: [meusDados?.userphoto || './public/img/default.jpg']
    };
  }

  const likersExibicao = likersTotal.filter(l => l.uid !== usuarioLogadoUid);
  if (likersExibicao.length === 0) return { usernames: ["você"], total, fotos: [] };

  likersExibicao.sort((a, b) => b.timestamp - a.timestamp);

  const amigosSnap = await getDocs(collection(db, `users/${usuarioLogadoUid}/friends`));
  const amigosUid = amigosSnap.docs.map(d => d.id);

  const amigosQueCurtiram = likersExibicao.filter(l => amigosUid.includes(l.uid));
  const outrosQueCurtiram = likersExibicao.filter(l => !amigosUid.includes(l.uid));

  const pessoasParaMostrar = [
    ...amigosQueCurtiram.slice(0, 2),
    ...outrosQueCurtiram.slice(0, 2 - Math.min(2, amigosQueCurtiram.length))
  ].slice(0, 2);

  const dadosPessoas = await Promise.all(
    pessoasParaMostrar.map(p => buscarUsuarioCached(p.uid))
  );

  const usernames = dadosPessoas.map(d => d?.username || d?.displayname || "usuário");
  const fotos = dadosPessoas.map(d => d?.userphoto || './public/img/default.jpg');

  return { usernames, total, fotos };
}

export function _animarCoracaoLike(carousel, e) {
  const rect = carousel.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const heart = document.createElement('div');
  heart.innerHTML = '❤️';
  heart.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    font-size: 50px;
    animation: floatHeart 1.5s ease-out forwards;
    z-index: 1000;
  `;

  if (!document.getElementById('heart-animation-style')) {
    const style = document.createElement('style');
    style.id = 'heart-animation-style';
    style.textContent = `
      @keyframes floatHeart {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-100px) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }

  carousel.style.position = 'relative';
  carousel.appendChild(heart);
  setTimeout(() => heart.remove(), 1500);
}
