// inicializador.js - Arquivo principal
import { LiveStatusManager } from './live-status-manager.js';
import { SearchService } from './search-service.js';
import { FollowSystem } from './follow-system.js';

class AppInitializer {
  constructor() {
    this.liveStatusManager = null;
    this.searchService = null;
    this.followSystem = null;
    this.currentUser = null;
    
    this.init();
  }

  init() {
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    console.log('🚀 Inicializando aplicação...');
    
    // Obter usuário atual
    this.getCurrentUser();
    
    // Inicializar serviços
    this.initializeLiveStatus();
    this.initializeSearch();
    this.initializeFollowSystem();
    
    // Disponibilizar globalmente para compatibilidade
    this.exposeGlobalServices();
    
    console.log('✅ Aplicação inicializada com sucesso');
  }

  getCurrentUser() {
    const userJson = localStorage.getItem('usuarioLogado');
    if (userJson) {
      this.currentUser = JSON.parse(userJson);
      console.log('👤 Usuário atual:', this.currentUser.username);
    } else {
      console.log('⚠️ Nenhum usuário logado encontrado');
    }
  }

  initializeLiveStatus() {
    if (this.currentUser?.username) {
      this.liveStatusManager = new LiveStatusManager(this.currentUser.username);
      console.log('📡 Live Status inicializado');
    }
  }

  initializeSearch() {
    this.searchService = new SearchService();
    console.log('🔍 Serviço de busca inicializado');
  }

  initializeFollowSystem() {
    this.followSystem = new FollowSystem();
    
    // Configurar botão de seguir se estiver na página de perfil
    if (window.location.pathname.includes('PF.html')) {
      this.followSystem.configurarBotaoSeguir();
      console.log('👥 Sistema de seguir configurado');
    }
  }

  exposeGlobalServices() {
    // Disponibilizar serviços globalmente para scripts inline
    window.AppServices = {
      liveStatus: this.liveStatusManager,
      search: this.searchService,
      follow: this.followSystem,
      currentUser: this.currentUser
    };

    // Funções específicas para compatibilidade
    window.seguirUsuario = (current, target) => 
      this.followSystem.seguirUsuario(current, target);
    
    window.deixarDeSeguir = (current, target) => 
      this.followSystem.deixarDeSeguir(current, target);
    
    window.atualizarEstatisticasPerfil = (username) => 
      this.followSystem.atualizarEstatisticasPerfil(username);
    
    console.log('🌐 Serviços disponibilizados globalmente');
  }

  // Método para limpar recursos
  destroy() {
    if (this.liveStatusManager) {
      this.liveStatusManager.destroy();
    }
    console.log('🧹 Recursos limpos');
  }
}

// Inicializar aplicação
new AppInitializer();

// Limpar recursos antes de sair da página
window.addEventListener('beforeunload', () => {
  if (window.AppServices?.liveStatus) {
    window.AppServices.liveStatus.destroy();
  }
});