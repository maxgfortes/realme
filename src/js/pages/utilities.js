import { getFirestore, doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const db = getFirestore();
const auth = getAuth();

export function formatarHashtags(texto) {
  return texto.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

export function formatarMentions(texto) {
  const mentionRegex = /@([a-z0-9._]+)/g;
  return texto.replace(mentionRegex, (match, username) => {
    return `<a href="profile?u=${username}" class="mention">@${username}</a>`;
  });
}

export function formatarTexto(text) {
  let texto = formatarHashtags(text);
  texto = formatarMentions(texto);
  return texto;
}

export function formatarDataRelativa(data) {
  if (!data) return 'Data não disponível';
  try {
    let date;
    if (typeof data === 'object' && data.seconds) {
      date = new Date(data.seconds * 1000);
    } else {
      date = new Date(data);
    }
    const agora = new Date();
    const diferenca = agora.getTime() - date.getTime();
    const minutos = Math.floor(diferenca / (1000 * 60));
    const horas = Math.floor(diferenca / (1000 * 60 * 60));
    const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
    const semanas = Math.floor(dias / 7);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);

    if (minutos < 1) return 'Agora mesmo';
    else if (minutos < 60) return `há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    else if (horas < 24) return `há ${horas} hora${horas !== 1 ? 's' : ''}`;
    else if (dias < 7) return `há ${dias} dia${dias !== 1 ? 's' : ''}`;
    else if (semanas < 4) return `há ${semanas} semana${semanas !== 1 ? 's' : ''}`;
    else if (meses < 12) return `há ${meses} mês${meses !== 1 ? 'es' : ''}`;
    else return `há ${anos} ano${anos !== 1 ? 's' : ''}`;
  } catch (error) {
    return 'Data inválida';
  }
}

export function gerarIdUnico(prefixo = 'id') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `${prefixo}-${timestamp}${random}`;
}

export async function buscarDadosUsuarioPorUid(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      return null;
    }
    const userData = docSnap.data();

    let userphoto = '';
    try {
      const photoRef = doc(db, "users", uid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        userphoto = photoSnap.data().userphoto || '';
      }
    } catch (e) {}

    const resultado = {
      userphoto,
      username: userData.username || '',
      displayname: userData.displayname || '',
      name: userData.name || '',
      surname: userData.surname || '',
      verified: userData.verified || false
    };

    const fullname = `${resultado.name} ${resultado.surname}`.trim();
    resultado.fullname = fullname;

    return resultado;
  } catch (error) {
    return null;
  }
}

export function toSeconds(ts) {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts.seconds) return ts.seconds;
  return new Date(ts).getTime() / 1000;
}

export function ordenarCronologico(posts) {
  return posts.sort((a, b) => toSeconds(b.create) - toSeconds(a.create));
}

export function obterFotoPerfil(userData, usuarioLogado) {
  const possiveisFotos = [
    userData?.userphoto,
    userData?.foto,
    usuarioLogado?.userphoto,
    usuarioLogado?.foto
  ];
  for (const foto of possiveisFotos) {
    if (foto && typeof foto === 'string') {
      try {
        new URL(foto);
        return foto;
      } catch {
        continue;
      }
    }
  }
  return './public/img/default.jpg';
}

const CACHE_USER_TIME = 1000 * 60 * 30;

export function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.value || null;
  } catch {
    return null;
  }
}

export function isCacheExpirado(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const data = JSON.parse(raw);
    return Date.now() - data.time > CACHE_USER_TIME;
  } catch {
    return true;
  }
}

export function setCache(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        time: Date.now(),
        value
      })
    );
  } catch {}
}

export async function buscarUsuarioCached(uid) {
  const key = `user_cache_${uid}`;

  const ehProprioUsuario = auth.currentUser && auth.currentUser.uid === uid;
  if (ehProprioUsuario) {
    if (!isCacheExpirado(key)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          return JSON.parse(raw).value;
        } catch {}
      }
    }
    const dados = await buscarDadosUsuarioPorUid(uid);
    if (dados) setCache(key, dados);
    return dados;
  }

  let stale = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      stale = JSON.parse(raw).value;
    }
  } catch {}

  if (stale) {
    if (isCacheExpirado(key)) {
      buscarDadosUsuarioPorUid(uid)
        .then(dados => {
          if (dados) setCache(key, dados);
        })
        .catch(() => {});
    }
    return stale;
  }

  const dados = await buscarDadosUsuarioPorUid(uid);
  if (dados) setCache(key, dados);
  return dados;
}

export function mostrarLoading(mensagem) {
  const container = document.createElement('div');
  container.className = 'loading-overlay';
  container.id = 'loadingOverlay';
  container.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <p class="loading-text">${mensagem}</p>
    </div>
  `;
  document.body.appendChild(container);

  const style = document.createElement('style');
  style.textContent = `
    .loading-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .loading-content {
      text-align: center;
      color: #fff;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);

  return {
    interval: setInterval(() => {}, 1000)
  };
}

export function esconderLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}

export function atualizarTextoLoading(mensagem) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    const text = overlay.querySelector('.loading-text');
    if (text) text.textContent = mensagem;
  }
}
