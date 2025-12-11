// ============================================
// SISTEMA AUTOMÁTICO DE TROCA DE TEMAS
/* ============================================

class ThemeManager {
  constructor() {
    this.init();
  }

  init() {
    // 1. Verifica se há tema salvo no localStorage
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme) {
      // Usa o tema salvo
      this.setTheme(savedTheme);
    } else {
      // Detecta preferência do sistema
      this.detectSystemTheme();
    }

    // 2. Escuta mudanças na preferência do sistema
    this.watchSystemTheme();
  }

  // Detecta o tema preferido do sistema operacional
  detectSystemTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = prefersDark ? 'dark' : 'light';
    this.setTheme(theme);
  }

  // Define o tema
  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Emite evento customizado para outros componentes reagirem
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
  }

  // Alterna entre os temas
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    return newTheme;
  }

  // Retorna o tema atual
  getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }

  // Escuta mudanças automáticas do sistema
  watchSystemTheme() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Para navegadores modernos
    if (darkModeQuery.addEventListener) {
      darkModeQuery.addEventListener('change', (e) => {
        // Só muda automaticamente se o usuário não tiver escolhido manualmente
        if (!localStorage.getItem('theme-manual')) {
          const theme = e.matches ? 'dark' : 'light';
          this.setTheme(theme);
        }
      });
    } else {
      // Fallback para navegadores antigos
      darkModeQuery.addListener((e) => {
        if (!localStorage.getItem('theme-manual')) {
          const theme = e.matches ? 'dark' : 'light';
          this.setTheme(theme);
        }
      });
    }
  }

  // Marca que o usuário escolheu manualmente (para não mudar automaticamente)
  setManualPreference(isManual = true) {
    if (isManual) {
      localStorage.setItem('theme-manual', 'true');
    } else {
      localStorage.removeItem('theme-manual');
    }
  }

  // Remove preferência manual (volta a seguir o sistema)
  resetToSystem() {
    localStorage.removeItem('theme-manual');
    localStorage.removeItem('theme');
    this.detectSystemTheme();
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Instancia o gerenciador de tema
const themeManager = new ThemeManager();

// Expõe globalmente para uso em outros scripts
window.themeManager = themeManager;

// ============================================
// EXEMPLO DE USO COM BOTÃO
// ============================================

// Adiciona listener para botão de toggle (se existir)
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle');
  
  if (themeToggleBtn) {
    // Atualiza o ícone inicial
    updateThemeIcon(themeToggleBtn);
    
    // Adiciona evento de clique
    themeToggleBtn.addEventListener('click', () => {
      const newTheme = themeManager.toggleTheme();
      themeManager.setManualPreference(true); // Marca como escolha manual
      updateThemeIcon(themeToggleBtn);
      
      // Feedback visual
      themeToggleBtn.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        themeToggleBtn.style.transform = 'rotate(0deg)';
      }, 300);
    });
  }
});

// Atualiza o ícone do botão baseado no tema
function updateThemeIcon(button) {
  const currentTheme = themeManager.getCurrentTheme();
  
  if (currentTheme === 'dark') {
    button.innerHTML = '<i class="fas fa-sun"></i>'; // Ícone de sol (modo claro disponível)
    button.title = 'Ativar modo claro';
  } else {
    button.innerHTML = '<i class="fas fa-moon"></i>'; // Ícone de lua (modo escuro disponível)
    button.title = 'Ativar modo escuro';
  }
}

// ============================================
// LISTENERS DE EVENTOS
// ============================================

// Escuta mudanças de tema para reagir em outros componentes
window.addEventListener('themeChanged', (e) => {
  console.log('Tema alterado para:', e.detail.theme);
  
  // Aqui você pode adicionar lógica adicional quando o tema mudar
  // Exemplo: atualizar cores de gráficos, recarregar imagens, etc.
});

// ============================================
// UTILITÁRIOS EXTRAS
// ============================================

// Função para obter o tema atual (atalho)
function getCurrentTheme() {
  return themeManager.getCurrentTheme();
}

// Função para alternar tema (atalho)
function toggleTheme() {
  return themeManager.toggleTheme();
}

// Função para definir tema específico (atalho)
function setTheme(theme) {
  themeManager.setTheme(theme);
}

// Expõe funções globalmente
window.getCurrentTheme = getCurrentTheme;
window.toggleTheme = toggleTheme;
window.setTheme = setTheme; */