// ===================
// INICIALIZADORES DOM E UTILITÁRIOS
// ===================

import { db } from './config.js';
import { LiveStatusManager } from './live-status.js';
import { carregarPerfilCompleto } from './profile-loader.js';
import { configurarNavegacaoTabs } from './navigation.js';
import { atualizarMarqueeUltimoUsuario, configurarLinks, verificarLogin } from './utils.js';

// ===================
// VARIÁVEIS GLOBAIS
// ===================
let liveStatusManager = null;

// ===================
// FUNÇÕES DE UTILITÁRIOS
// ===================
function determinarUsuarioParaCarregar() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  if (usernameParam) {
    return usernameParam;
  }
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return usuarioLogado.username;
  }
  
  return null;
}

function isPerfilProprio() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return !usernameParam || usernameParam === usuarioLogado.username;
  }
  
  return false;
}

// ===================
// INICIALIZAÇÃO PRINCIPAL
// ===================
window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Carregando página de perfil...");
  
  if (!verificarLogin()) {
    return;
  }
  
  // Inicializar Live Status
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    liveStatusManager = new LiveStatusManager(usuarioLogado.username);
  }
  
  // Configurar navegação entre tabs
  configurarNavegacaoTabs();
  
  await carregarPerfilCompleto();
  await atualizarMarqueeUltimoUsuario();
  configurarLinks();
  
  console.log("✅ Página de perfil carregada com sucesso!");
});

// ===================
// CLEANUP AO SAIR DA PÁGINA
// ===================
window.addEventListener('beforeunload', () => {
  if (liveStatusManager) {
    liveStatusManager.destroy();
  }
});

// Exportar funções globais
export { determinarUsuarioParaCarregar, isPerfilProprio };