import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  triggerEdicaoPerfil,
  triggerMudancaStatus
} from "./activitie-creator.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const IMGBB_API_KEY = "fc8497dcdf559dc9cbff97378c82344c";

const fields = {
  name: document.getElementById("name"),
  surname: document.getElementById("surname"),
  username: document.getElementById("username"),
  pronomes: document.getElementById("pronomes"),
  bio: document.getElementById("bio"),
  genero: document.getElementById("genero"),
  localizacao: document.getElementById("localizacao"),
  relacionamento: document.getElementById("relacionamento"),
  musica: document.getElementById("musica")
};

const pfpImg = document.querySelector(".pfp");
const bannerImg = document.querySelector(".banner");
const pfpArea = document.querySelector(".pfp-area");
const bannerArea = document.querySelector(".banner-area");

const linkInputs = document.querySelectorAll("[data-link]");

const saveBtn = document.querySelector(".save-btn");
const linksToggle = document.getElementById("links-toggle");
const linksList = document.querySelector(".links-list");

let currentUser = null;
let oldData = {};
let pendingUploads = {
  userphoto: null,
  headerphoto: null
};

const CACHE_PREFIX = "profileEditCache:";

function getCache(uid) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + uid);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function setCache(uid, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + uid, JSON.stringify(data));
  } catch (error) {
    return;
  }
}

let toastEl = null;
let toastTimeout = null;

function ensureToastStyles() {
  if (document.getElementById("app-toast-styles")) return;

  const style = document.createElement("style");
  style.id = "app-toast-styles";
  style.textContent = `
    .app-toast {
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translate(-50%, 140%);
      background: rgb(20, 20, 20);
      color: #fff;
      padding: 12px 22px;
      border-radius: 10px;
      font-size: 14px;
      line-height: 1.4;
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      z-index: 99999;
      width: 90%;
      text-align: center;
      pointer-events: none;
    }

    .app-toast.show {
      transform: translate(-50%, -60px);
    }
  `;
  document.head.appendChild(style);
}

function showToast(message, options = {}) {
  const { persist = false, duration = 2600 } = options;

  ensureToastStyles();

  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "app-toast";
    document.body.appendChild(toastEl);
  }

  clearTimeout(toastTimeout);
  toastEl.textContent = message;

  requestAnimationFrame(() => {
    toastEl.classList.add("show");
  });

  if (!persist) {
    toastTimeout = setTimeout(() => {
      hideToast();
    }, duration);
  }
}

function hideToast() {
  clearTimeout(toastTimeout);
  if (toastEl) {
    toastEl.classList.remove("show");
  }
}

function setSelectValue(select, rawValue) {
  const value = (rawValue || "").trim();

  if (!value) {
    select.value = "";
    return;
  }

  const match = Array.from(select.options).find(
    option => option.value.trim().toLowerCase() === value.toLowerCase()
  );

  if (match) {
    select.value = match.value;
    return;
  }

  const extraOption = document.createElement("option");
  extraOption.value = value;
  extraOption.textContent = value;
  select.appendChild(extraOption);
  select.value = value;
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
    {
      method: "POST",
      body: formData
    }
  );

  const data = await response.json();

  if (!data.success) {
    throw new Error("Erro ao enviar imagem.");
  }

  return data.data.url;
}

function compressImage(file, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (type === "pfp") {
          canvas.width = 200;
          canvas.height = 200;

          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;

          ctx.drawImage(
            img,
            sx,
            sy,
            size,
            size,
            0,
            0,
            200,
            200
          );
        } else {
          const width = 750;
          const height = Math.round(
            (img.height / img.width) * width
          );

          canvas.width = width;
          canvas.height = height;

          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );
        }

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error("Erro ao comprimir a imagem."));
              return;
            }

            resolve(
              new File(
                [blob],
                `${type}.jpg`,
                {
                  type: "image/jpeg",
                  lastModified: Date.now()
                }
              )
            );
          },
          "image/jpeg",
          0.8
        );
      };

      img.onerror = () => {
        reject(new Error("Erro ao carregar a imagem."));
      };

      img.src = reader.result;
    };

    reader.onerror = () => {
      reject(new Error("Erro ao ler a imagem."));
    };

    reader.readAsDataURL(file);
  });
}

function chooseImage(type) {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = "image/*";

  input.onchange = async () => {
    const file = input.files[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("A imagem deve ter no máximo 5MB.");
      return;
    }

    const preview = URL.createObjectURL(file);

    if (type === "pfp") {
      pfpImg.src = preview;
    } else {
      bannerImg.src = preview;
    }

    try {
      const compressedFile = await compressImage(file, type);

      if (type === "pfp") {
        pendingUploads.pfp = compressedFile;
      } else {
        pendingUploads.banner = compressedFile;
      }
    } catch (error) {
      showToast("Erro ao processar a imagem.");
    }
  };

  input.click();
}

pfpArea.onclick = () => chooseImage("pfp");
bannerArea.onclick = () => chooseImage("banner");

const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[' -][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;

const RULES = {
  name: v => {
    if (!v) return "Digite seu nome";
    if (v.length > 10) return "O nome deve ter no máximo 10 caracteres";
    if (!NAME_REGEX.test(v)) return "Digite um nome válido";
    return null;
  },

  surname: v => {
    if (!v) return "Digite seu sobrenome";
    if (v.length > 15) return "O sobrenome deve ter no máximo 15 caracteres";
    if (!NAME_REGEX.test(v)) return "Digite um sobrenome válido";
    return null;
  },

  username: v => {
    if (!v) return "Digite seu nome de usuári.";
    if (v.length < 3) return "O username precisa ter pelo menos 3 caracteres";
    if (v.length > 20) return "O username deve ter no máximo 20 caracteres";
    if (!/^[a-z0-9_]+$/.test(v)) {
      return "O username só pode ter letras minúsculas, números e _.";
    }
    return null;
  },

  pronomes: v => (
    v.length > 30
      ? "Os pronomes devem ter no máximo 30 caracteres."
      : null
  ),

  bio: v => (
    v.length > 150
      ? "A bio deve ter no máximo 150 caracteres."
      : null
  ),

  localizacao: v => (
    v.length > 50
      ? "A localização deve ter no máximo 50 caracteres."
      : null
  ),

  musica: v => (
    v && !/youtube\.com|youtu\.be/.test(v)
      ? "Cole uma URL válida do YouTube."
      : null
  )
};

function validate(values) {
  for (const key of Object.keys(RULES)) {
    const error = RULES[key](values[key]);

    if (error) return error;
  }

  return null;
}

function applyUserData(data) {
  const media = data.media || {};
  const more = data.more || {};
  const about = data.about || {};
  const links = data.links || {};

  fields.name.value = data.name || "";
  fields.surname.value = data.surname || "";
  fields.username.value = data.username || "";
  fields.bio.value = more.bio || "";
  fields.localizacao.value = about.location || "";
  fields.musica.value = media.musicTheme || "";

  fields.pronomes.value = about.pronom1
    ? about.pronom1 + (about.pronom2 ? "/" + about.pronom2 : "")
    : "";

  setSelectValue(fields.genero, about.gender);
  setSelectValue(fields.relacionamento, about.maritalStatus);

  const pfpUrl = media.pfp || media.userphoto;

  if (pfpUrl) {
    pfpImg.src = pfpUrl;
  }

  const bannerUrl = media.banner || media.headerphoto;

  if (bannerUrl) {
    bannerImg.src = bannerUrl;
  }

  linkInputs.forEach(input => {
    input.value = links[input.dataset.link] || "";
  });
}

async function loadUser() {
  const uid = currentUser.uid;
  const cached = getCache(uid);

  if (cached) {
    oldData = cached;
    applyUserData(cached);
  }

  const [
    userSnap,
    mediaSnap,
    moreSnap,
    aboutSnap,
    linksSnap
  ] = await Promise.all([
    getDoc(doc(db, "users", uid)),
    getDoc(doc(db, `users/${uid}/user-infos/user-media`)),
    getDoc(doc(db, `users/${uid}/user-infos/more-infos`)),
    getDoc(doc(db, `users/${uid}/user-infos/about`)),
    getDoc(doc(db, `users/${uid}/user-infos/links`))
  ]);

  const user = userSnap.exists() ? userSnap.data() : {};
  const media = mediaSnap.exists() ? mediaSnap.data() : {};
  const more = moreSnap.exists() ? moreSnap.data() : {};
  const about = aboutSnap.exists() ? aboutSnap.data() : {};
  const links = linksSnap.exists() ? linksSnap.data() : {};

  const fresh = {
    ...user,
    media,
    more,
    about,
    links
  };

  oldData = fresh;
  applyUserData(fresh);
  setCache(uid, fresh);
}

async function usernameAvailable(username) {
  if (username === oldData.username) {
    return true;
  }

  const snap = await getDoc(
    doc(db, "usernames", username)
  );

  if (!snap.exists()) {
    return true;
  }

  return snap.data().uid === currentUser.uid;
}

saveBtn.onclick = async () => {
  if (!currentUser) {
    showToast("Você precisa estar logado.");
    return;
  }

  const values = {
    name: fields.name.value.trim(),
    surname: fields.surname.value.trim(),
    username: fields.username.value.trim(),
    pronomes: fields.pronomes.value.trim(),
    bio: fields.bio.value.trim(),
    genero: fields.genero.value.trim(),
    localizacao: fields.localizacao.value.trim(),
    relacionamento: fields.relacionamento.value.trim(),
    musica: fields.musica.value.trim()
  };

  const error = validate(values);

  if (error) {
    showToast(error);
    return;
  }

  saveBtn.disabled = true;

  const isUploadingImages = Boolean(
    pendingUploads.pfp || pendingUploads.banner
  );

  try {
    const available = await usernameAvailable(values.username);

    if (!available) {
      showToast("Este username já está em uso.");
      return;
    }

    let pfpUrl =
      oldData.media?.pfp ||
      oldData.media?.userphoto ||
      "";

    let bannerUrl =
      oldData.media?.banner ||
      oldData.media?.headerphoto ||
      "";

    if (isUploadingImages) {
      showToast("Enviando imagens...", { persist: true });
    }

    if (pendingUploads.pfp) {
      pfpUrl = await uploadImage(pendingUploads.pfp);
    }

    if (pendingUploads.banner) {
      bannerUrl = await uploadImage(pendingUploads.banner);
    }

    const uid = currentUser.uid;
    const [pronom1, pronom2] = values.pronomes.split("/");

    await Promise.all([
      setDoc(
        doc(db, "users", uid),
        {
          name: values.name,
          surname: values.surname,
          username: values.username
        },
        { merge: true }
      ),

      setDoc(
        doc(db, `users/${uid}/user-infos/user-media`),
        {
          userphoto: pfpUrl,
          headerphoto: bannerUrl,
          musicTheme: values.musica
        },
        { merge: true }
      ),

      setDoc(
        doc(db, `users/${uid}/user-infos/more-infos`),
        {
          bio: values.bio
        },
        { merge: true }
      ),

      setDoc(
        doc(db, `users/${uid}/user-infos/about`),
        {
          gender: values.genero,
          location: values.localizacao,
          maritalStatus: values.relacionamento,
          pronom1: pronom1 || "",
          pronom2: pronom2 || ""
        },
        { merge: true }
      ),

      setDoc(
        doc(db, `users/${uid}/user-infos/links`),
        collectLinks(),
        { merge: true }
      )
    ]);

    if (values.username !== oldData.username) {
      await setDoc(
        doc(db, "usernames", values.username),
        {
          uid,
          username: values.username
        }
      );
    }

    setCache(uid, {
      ...oldData,
      name: values.name,
      surname: values.surname,
      username: values.username,
      media: {
        ...(oldData.media || {}),
        userphoto: pfpUrl,
        headerphoto: bannerUrl,
        musicTheme: values.musica
      },
      more: {
        ...(oldData.more || {}),
        bio: values.bio
      },
      about: {
        ...(oldData.about || {}),
        gender: values.genero,
        location: values.localizacao,
        maritalStatus: values.relacionamento,
        pronom1: pronom1 || "",
        pronom2: pronom2 || ""
      },
      links: collectLinks()
    });

    notifyActivities(values);

    hideToast();
    showToast("Perfil salvo com sucesso!");

    setTimeout(() => {
      window.location.href =
        `profile.html?username=${values.username}`;
    }, 1200);

  } catch (err) {
    hideToast();
    showToast("Erro ao salvar o perfil.");
  } finally {
    saveBtn.disabled = false;
  }
};

function collectLinks() {
  const links = {};

  linkInputs.forEach(input => {
    links[input.dataset.link] = input.value.trim();
  });

  return links;
}

function notifyActivities(values) {
  const changed = [];

  if (values.name !== (oldData.name || "")) {
    changed.push("nome");
  }

  if (values.surname !== (oldData.surname || "")) {
    changed.push("sobrenome");
  }

  if (values.bio !== (oldData.more?.bio || "")) {
    changed.push("bio");
  }

  if (values.genero !== (oldData.about?.gender || "")) {
    changed.push("genero");
  }

  if (values.localizacao !== (oldData.about?.location || "")) {
    changed.push("localizacao");
  }

  if (values.musica !== (oldData.media?.musicTheme || "")) {
    changed.push("musica");
  }

  if (pendingUploads.pfp) {
    changed.push("foto");
  }

  if (pendingUploads.banner) {
    changed.push("banner");
  }

  if (changed.length > 0) {
    triggerEdicaoPerfil(changed).catch(() => {});
  }

  if (
    values.relacionamento &&
    values.relacionamento !==
      (oldData.about?.maritalStatus || "")
  ) {
    triggerMudancaStatus(values.relacionamento).catch(() => {});
  }
}

fields.username.addEventListener("input", () => {
  fields.username.value = fields.username.value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
});

linksToggle.onclick = () => {
  linksList.classList.toggle("open");
};

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  try {
    await loadUser();
  } catch (err) {
    showToast("Erro ao carregar seus dados.");
  }
});