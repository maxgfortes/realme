// save-posts.js - Sistema de Salvar Posts (CORRIGIDO PARA USAR "saves")
import { 
    initializeApp, 
    getApp, 
    getApps 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const app = getApps().length > 0 ? getApp() : null;

if (!app) {
    console.error("Firebase App não inicializada. Verifique se 'feed.js' foi carregado primeiro.");
}

const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

// ===================
// FEEDBACK VISUAL
// ===================
function mostrarFeedback(mensagem, tipo = 'info') {
  const feedback = document.createElement('div');
  feedback.className = `save-feedback ${tipo}`;
  feedback.textContent = mensagem;
  
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    background: ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#17a2b8'};
    color: white;
    font-size: 14px;
    z-index: 99999999999;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: none;
  `;

  document.body.appendChild(feedback);

  setTimeout(() => {
    feedback.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => feedback.remove(), 300);
  }, 3000);
}

// CSS Animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);


// ===================
// SALVAR POST (CORRIGIDO PARA "saves")
// ===================
export async function toggleSalvarPost(postId) {
    if (!auth || !db) {
        mostrarFeedback("Erro de inicialização do Firebase. Tente recarregar a página.", 'error');
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        mostrarFeedback("Você precisa estar logado para salvar posts.", 'info');
        return;
    }

    const uid = user.uid;
    // 💡 CORREÇÃO: Coleção "saves"
    const saveRef = doc(db, "users", uid, "saves", postId);
    
    const btnElement = document.querySelector(`.btn-save[data-post-id="${postId}"]`);

    try {
        const docSnap = await getDoc(saveRef);
        
        if (docSnap.exists()) {
            // Se já está salvo, dessalvar
            await deleteDoc(saveRef);
            if(btnElement) btnElement.classList.remove('saved');
            mostrarFeedback("Post removido dos salvos.", 'info');
        } else {
            // Se não está salvo, salvar
            await setDoc(saveRef, {
                postId: postId,
                savedAt: serverTimestamp()
            });
            if(btnElement) btnElement.classList.add('saved');
            mostrarFeedback("Post salvo com sucesso!", 'success');
        }
    } catch (error) {
        console.error("Erro ao salvar/remover post:", error);
        mostrarFeedback("Erro ao processar a ação de salvar.", 'error');
    }
}


// ===================
// BUSCAR POSTS SALVOS (CORRIGIDO PARA "saves")
// ===================
export async function buscarPostsSalvos() {
    if (!auth || !db) {
        throw new Error("Firebase App não inicializada ou usuário não logado.");
    }

    const user = auth.currentUser;
    if (!user) {
        return [];
    }

    const uid = user.uid;
    // 💡 CORREÇÃO: Coleção "saves"
    const savedPostsColRef = collection(db, "users", uid, "saves");
    
    try {
        // 1. Pega os IDs dos posts salvos, ordenados por data de salvamento
        const q = query(savedPostsColRef, orderBy("savedAt", "desc"));
        const savedPostsSnap = await getDocs(q);
        
        const savedPosts = [];
        const fetchPromises = [];

        // 2. Para cada ID, busca os dados completos do post e do criador
        savedPostsSnap.forEach((docSnap) => {
            const postId = docSnap.id;
            const postRef = doc(db, "posts", postId);
            
            const fetchPost = async () => {
                try {
                    const postSnap = await getDoc(postRef);
                    if (postSnap.exists()) {
                        const postData = { ...postSnap.data(), id: postSnap.id, savedAt: docSnap.data().savedAt };
                        
                        // Busca os dados do criador
                        const creatorid = postData.creatorid;
                        const creatorRef = doc(db, `users/${creatorid}/user-infos/user-media`);
                        const creatorSnap = await getDoc(creatorRef);

                        if (creatorSnap.exists()) {
                            postData.creatorData = creatorSnap.data();
                        } else {
                            postData.creatorData = {};
                        }
                        
                        return postData;
                    }
                } catch (error) {
                    console.error(`Erro ao buscar post ${postId}:`, error);
                    return null;
                }
            };

            fetchPromises.push(fetchPost());
        });

        const results = await Promise.all(fetchPromises);
        
        // Filtra resultados nulos
        results.forEach(post => {
            if (post) savedPosts.push(post);
        });

        return savedPosts;

    } catch (error) {
        console.error("Erro ao buscar a lista de posts salvos:", error);
        throw error;
    }
}


// ===================
// VERIFICAR SE ESTÁ SALVO (CORRIGIDO PARA "saves")
// ===================
export async function verificarSeEstaSalvo(postId) {
    if (!auth || !db) return false;
    
    const user = auth.currentUser;
    if (!user) return false;

    const uid = user.uid;
    // 💡 CORREÇÃO: Coleção "saves"
    const saveRef = doc(db, "users", uid, "saves", postId);

    try {
        const docSnap = await getDoc(saveRef);
        return docSnap.exists();
    } catch (error) {
        console.error("Erro ao verificar se post está salvo:", error);
        return false;
    }
}


// ===================
// EVENT LISTENER GLOBAL (Para feed.js, etc.)
// ===================
document.addEventListener('click', function(e) {
    if (e.target.closest('.btn-save')) { 
        const btn = e.target.closest('.btn-save');
        const postId = btn.getAttribute('data-post-id');
        if (postId) {
            e.preventDefault();
            toggleSalvarPost(postId);
        }
    }
});