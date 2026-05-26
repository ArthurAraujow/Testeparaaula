// ============================================
//  View Page - Visualização dos Alunos
//  Atualiza somente ao clicar no botão refresh
// ============================================

(function () {
    const contentArea = document.getElementById('content-area');
    const toastEl     = document.getElementById('toast');

    let lastText = null; // null = ainda não carregou

    // ---- Carregar texto compartilhado ----
    async function loadSharedText() {
        try {
            const res = await fetch('/api/text/shared');
            const data = await res.json();
            const text = data.text || '';

            // Só atualizar DOM se o texto mudou
            if (text !== lastText) {
                lastText = text;
                renderContent(text);
            }
        } catch (err) {
            // Se for o primeiro carregamento, mostrar erro
            if (lastText === null) {
                contentArea.innerHTML =
                    '<div class="empty-state animate-fade-in">' +
                    '  <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
                    '  <h1 class="text-3xl">Erro de Conexão</h1>' +
                    '  <p class="text-muted mt-4">Não foi possível conectar ao servidor. Verifique se o servidor está rodando.</p>' +
                    '</div>';
            }
        }
    }

    // ---- Renderizar conteúdo ----
    function renderContent(text) {
        if (!text) {
            contentArea.innerHTML =
                '<div class="empty-state animate-fade-in">' +
                '  <svg class="empty-state-icon" xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                '  <h1 class="text-3xl">Nenhum texto compartilhado</h1>' +
                '  <p class="text-muted mt-4">O professor ainda não compartilhou nenhum texto.</p>' +
                '  <p class="text-xs text-muted mt-2">Clique no botão de atualizar (↻) para verificar se há novo conteúdo.</p>' +
                '</div>';
            return;
        }

        contentArea.innerHTML =
            '<div class="flex items-center justify-between">' +
            '  <h1 class="text-3xl">Texto Compartilhado</h1>' +
            '  <button id="refresh-btn" class="btn btn-outline btn-icon" title="Atualizar agora">' +
            '    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' +
            '  </button>' +
            '</div>' +
            '<div class="text-display animate-fade-text">' +
            '  <p class="text-display-content">' + escapeHtml(text) + '</p>' +
            '</div>' +
            '<button id="copy-text-btn" class="btn btn-primary btn-lg">' +
            '  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
            '  <span>Copiar Texto</span>' +
            '</button>';

        // Reaplicar event listeners
        var refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                this.querySelector('svg').style.animation = 'spin 0.5s linear';
                loadSharedText();
                setTimeout(() => {
                    this.querySelector('svg').style.animation = '';
                }, 500);
            });
        }

        var copyBtn = document.getElementById('copy-text-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function () {
                copyText(text);
            });
        }
    }

    // ---- Copiar texto ----
    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                fallbackCopy(text);
            }

            // Feedback no botão
            var btn = document.getElementById('copy-text-btn');
            if (btn) {
                btn.innerHTML =
                    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
                    '<span>Copiado!</span>';

                showToast('Texto copiado para a área de transferência!');

                setTimeout(() => {
                    btn.innerHTML =
                        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
                        '<span>Copiar Texto</span>';
                }, 2500);
            }
        } catch (err) {
            showToast('Texto copiado!');
        }
    }

    // ---- Utilitários ----
    function escapeHtml(str) {
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }

    function showToast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        setTimeout(function () { toastEl.classList.remove('show'); }, 2500);
    }

    // ---- Inicializar ----
    loadSharedText();
})();
