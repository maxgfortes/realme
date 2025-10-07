document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('postmodal');
    const openButtons = document.querySelectorAll('.modalopen');
    const closeButton = document.querySelector('.close');
    const closeBtn = document.querySelector('.close-btn');

    function openModal() {
        modal.style.display = 'flex';
        modal.offsetHeight;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }, 300);
    }

    openButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            openModal();
        });
    });

    if (closeButton) closeButton.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
            closeModal();
        }
    });

    const btnPrimary = document.querySelector('.btn-primary');
    if (btnPrimary) {
        btnPrimary.addEventListener('click', function() {
            const textarea = document.querySelector('textarea');
            const fileInput = document.querySelector('input[type="file"]');
            if ((textarea && textarea.value.trim()) || (fileInput && fileInput.files.length > 0)) {
                alert('Post criado com sucesso!');
                if (textarea) textarea.value = '';
                if (fileInput) fileInput.value = '';
                closeModal();
            } else {
                alert('Escreva algo ou adicione uma mídia para publicar!');
            }
        });
    }
});