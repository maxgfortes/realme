// Modal de notificações
let currentNotificationModal = null;
let currentFocusedNotification = null;

// Criar o modal uma vez
function createNotificationModal() {
    const modal = document.createElement('div');
    modal.className = 'notification-modal';
    modal.id = 'notificationModal';
    
    modal.innerHTML = `
        <button class="notification-modal-option" onclick="shareNotification()">
            <i class="fas fa-share"></i>
            Compartilhar
        </button>
        <button class="notification-modal-option delete" onclick="deleteNotification()">
            <i class="fas fa-trash"></i>
            Excluir
        </button>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// Inicializar modal e eventos
function initNotificationModal() {
    // Criar o modal se não existir
    if (!document.getElementById('notificationModal')) {
        currentNotificationModal = createNotificationModal();
    } else {
        currentNotificationModal = document.getElementById('notificationModal');
    }
    
    // Adicionar eventos de clique nas notificações
    const notifications = document.querySelectorAll('.notification-item');
    notifications.forEach(notification => {
        notification.addEventListener('click', function(e) {
            e.stopPropagation();
            showNotificationModal(e, this);
        });
    });
    
    // Fechar modal ao clicar fora
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.notification-modal') && !e.target.closest('.notification-item')) {
            closeNotificationModal();
        }
    });
}

// Mostrar o modal
function showNotificationModal(event, notificationElement) {
    // Remove foco anterior
    if (currentFocusedNotification) {
        currentFocusedNotification.classList.remove('focused');
    }
    
    // Adiciona foco na notificação atual
    notificationElement.classList.add('focused');
    currentFocusedNotification = notificationElement;
    
    // Posicionar o modal abaixo da notificação
    const rect = notificationElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    currentNotificationModal.style.top = (rect.bottom + scrollTop + 8) + 'px';
    currentNotificationModal.style.left = (rect.left + 20) + 'px';
    
    // Mostrar o modal
    currentNotificationModal.classList.add('show');
}

// Fechar o modal
function closeNotificationModal() {
    if (currentNotificationModal) {
        currentNotificationModal.classList.remove('show');
    }
    
    if (currentFocusedNotification) {
        currentFocusedNotification.classList.remove('focused');
        currentFocusedNotification = null;
    }
}

// Compartilhar notificação
function shareNotification() {
    if (currentFocusedNotification) {
        const notificationText = currentFocusedNotification.querySelector('.notification-text p, .notification-text').textContent;
        
        if (navigator.share) {
            navigator.share({
                title: 'RealMe - Notificação',
                text: notificationText,
            }).catch(err => console.log('Erro ao compartilhar:', err));
        } else {
            // Fallback - copiar para clipboard
            navigator.clipboard.writeText(notificationText).then(() => {
                alert('Notificação copiada para a área de transferência!');
            }).catch(() => {
                alert('Não foi possível compartilhar a notificação.');
            });
        }
    }
    
    closeNotificationModal();
}

// Excluir notificação
function deleteNotification() {
    if (currentFocusedNotification) {
        // Animação de saída
        currentFocusedNotification.style.transform = 'scale(0.8)';
        currentFocusedNotification.style.opacity = '0';
        
        setTimeout(() => {
            currentFocusedNotification.remove();
        }, 200);
    }
    
    closeNotificationModal();
}

// Inicializar quando o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    initNotificationModal();
});