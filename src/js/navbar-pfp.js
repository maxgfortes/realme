// ============================================
// NAVBAR PHOTO CACHE SYSTEM
// Sistema independente e reutilizável para foto da navbar
// ============================================

import { 
  getFirestore, 
  doc, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ============================================
// CONFIGURAÇÃO
// ============================================

const CACHE_KEY = 'navbar_photo_cache';
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutos

// ============================================
// CACHE MANAGER
// ============================================

class NavbarPhotoCache {
  constructor() {
    this.memoryCache = new Map();
    this.initLocalStorage();
  }

  // Inicializa cache do localStorage
  initLocalStorage() {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // Verifica se não expirou
        if (Date.now() - data.timestamp < CACHE_EXPIRY) {
          this.memoryCache.set(data.userId, data.photoUrl);
        } else {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch (e) {
      console.warn('Erro ao ler cache localStorage:', e);
    }
  }

  // Salva no cache (memória + localStorage)
  set(userId, photoUrl) {
    this.memoryCache.set(userId, photoUrl);
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        userId,
        photoUrl,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Erro ao salvar cache localStorage:', e);
    }
  }

  // Busca do cache
  get(userId) {
    return this.memoryCache.get(userId) || null;
  }

  // Limpa cache
  clear() {
    this.memoryCache.clear();
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (e) {
      console.warn('Erro ao limpar cache:', e);
    }
  }
}

// ============================================
// INSTÂNCIA GLOBAL DO CACHE
// ============================================

const photoCache = new NavbarPhotoCache();

// ============================================
// FUNÇÃO PRINCIPAL
// ============================================

export function initNavbarPhoto(firebaseApp) {
  const db = getFirestore(firebaseApp);
  const auth = getAuth(firebaseApp);
  const navPic = document.getElementById('nav-pic');

  if (!navPic) {
    console.warn('Elemento #nav-pic não encontrado');
    return;
  }

  // Estado de carregamento
  let isLoading = false;
  let currentUserId = null;

  // Função para carregar foto do Firestore
  async function loadPhotoFromFirestore(userId) {
    if (isLoading) return;
    
    isLoading = true;
    navPic.classList.add('loading');

    try {
      const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
      const userMediaSnap = await getDoc(userMediaRef);

      let photoUrl = './src/icon/default.jpg';

      if (userMediaSnap.exists()) {
        photoUrl = userMediaSnap.data().userphoto || './src/icon/default.jpg';
      }

      // Salva no cache
      photoCache.set(userId, photoUrl);
      
      // Atualiza imagem
      updateNavPhoto(photoUrl);

    } catch (error) {
      console.error('Erro ao carregar foto da navbar:', error);
      updateNavPhoto('./src/icon/default.jpg');
    } finally {
      isLoading = false;
      navPic.classList.remove('loading');
    }
  }

  // Atualiza a imagem com transição suave
  function updateNavPhoto(photoUrl) {
    // Pré-carrega imagem para evitar flash
    const img = new Image();
    img.onload = () => {
      navPic.style.opacity = '0';
      setTimeout(() => {
        navPic.src = photoUrl;
        navPic.style.opacity = '1';
      }, 150);
    };
    img.onerror = () => {
      navPic.src = './src/icon/default.jpg';
      navPic.style.opacity = '1';
    };
    img.src = photoUrl;
  }

  // Listener de autenticação
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserId = user.uid;

      // Tenta carregar do cache primeiro (INSTANTÂNEO)
      const cachedPhoto = photoCache.get(currentUserId);
      
      if (cachedPhoto) {
        // Cache hit! Mostra imediatamente
        navPic.src = cachedPhoto;
        navPic.style.opacity = '1';
      } else {
        // Cache miss - busca do Firestore
        await loadPhotoFromFirestore(currentUserId);
      }

    } else {
      // Usuário deslogado
      currentUserId = null;
      photoCache.clear();
      navPic.src = './src/icon/default.jpg';
      navPic.style.opacity = '1';
    }
  });

  // Retorna API pública
  return {
    // Atualiza foto manualmente (útil após upload)
    updatePhoto: (newPhotoUrl) => {
      if (currentUserId) {
        photoCache.set(currentUserId, newPhotoUrl);
        updateNavPhoto(newPhotoUrl);
      }
    },

    // Recarrega foto do servidor
    refresh: () => {
      if (currentUserId) {
        photoCache.clear();
        loadPhotoFromFirestore(currentUserId);
      }
    },

    // Limpa cache
    clearCache: () => {
      photoCache.clear();
    }
  };
}

// ============================================
// VERSÃO STANDALONE (SEM EXPORTS)
// Para usar diretamente no HTML
// ============================================

window.NavbarPhoto = {
  init: initNavbarPhoto,
  
  // Helpers globais
  updatePhoto: (newPhotoUrl) => {
    if (window.navbarPhotoInstance) {
      window.navbarPhotoInstance.updatePhoto(newPhotoUrl);
    }
  },
  
  refresh: () => {
    if (window.navbarPhotoInstance) {
      window.navbarPhotoInstance.refresh();
    }
  },
  
  clearCache: () => {
    if (window.navbarPhotoInstance) {
      window.navbarPhotoInstance.clearCache();
    }
  }
};

// ============================================
// AUTO-INICIALIZAÇÃO
// Se existir firebase app global
// ============================================

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Aguarda Firebase estar pronto
    const checkFirebase = setInterval(() => {
      if (window.firebaseApp) {
        clearInterval(checkFirebase);
        window.navbarPhotoInstance = initNavbarPhoto(window.firebaseApp);
        console.log('✅ Navbar Photo System inicializado');
      }
    }, 100);
    
    // Timeout de segurança (10s)
    setTimeout(() => clearInterval(checkFirebase), 10000);
  });
}