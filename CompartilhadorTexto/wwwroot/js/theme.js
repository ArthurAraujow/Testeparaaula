// ============================================
//  Theme Toggle - Compartilhado entre páginas
// ============================================

(function () {
    // Carregar tema salvo (padrão: dark)
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateIcons(savedTheme);

    // Configurar botão de toggle
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            updateIcons(next);
        });
    }

    function updateIcons(theme) {
        const sunIcon = document.getElementById('icon-sun');
        const moonIcon = document.getElementById('icon-moon');
        if (sunIcon) sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
        if (moonIcon) moonIcon.style.display = theme === 'light' ? 'block' : 'none';
    }
})();
