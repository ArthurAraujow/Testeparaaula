// ============================================
//  Admin Page - Editor de Texto do Professor
// ============================================

(function () {
    const editor       = document.getElementById('editor');
    const saveStatus   = document.getElementById('save-status');
    const logoutBtn    = document.getElementById('logout-btn');
    const copyLinkBtn  = document.getElementById('copy-link-btn');
    const copyIcon     = document.getElementById('copy-icon');
    const checkIcon    = document.getElementById('check-icon');
    const copyLinkText = document.getElementById('copy-link-text');
    const shareUrlEl   = document.getElementById('share-url');
    const toastEl      = document.getElementById('toast');

    let saveTimeout = null;
    let shareUrl = '';

    // ---- Verificar autenticação ----
    fetch('/api/auth/check')
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated) {
                window.location.href = '/login.html';
            }
        })
        .catch(() => {
            window.location.href = '/login.html';
        });

    // ---- Carregar texto salvo ----
    async function loadText() {
        try {
            const res = await fetch('/api/text');
            if (res.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            const data = await res.json();
            editor.value = data.text || '';
        } catch (err) {
            console.error('Erro ao carregar texto:', err);
        }
    }

    // ---- Salvar texto com debounce ----
    async function saveText(text) {
        updateStatus('saving', 'Salvando...');

        try {
            const res = await fetch('/api/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (res.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            if (res.ok) {
                updateStatus('saved', 'Salvo');
            } else {
                updateStatus('error', 'Erro ao salvar');
            }
        } catch (err) {
            updateStatus('error', 'Erro ao salvar');
        }
    }

    function updateStatus(state, label) {
        saveStatus.className = 'save-status ' + state;
        saveStatus.innerHTML = '<span class="save-dot"></span><span>' + label + '</span>';
    }

    editor.addEventListener('input', function () {
        clearTimeout(saveTimeout);
        updateStatus('saving', 'Editando...');
        saveTimeout = setTimeout(() => saveText(editor.value), 1000);
    });

    // ---- Carregar URL de compartilhamento ----
    async function loadShareInfo() {
        try {
            const res = await fetch('/api/info');
            if (res.ok) {
                const data = await res.json();
                const ip = data.addresses && data.addresses.length > 0
                    ? data.addresses[0]
                    : 'localhost';
                const port = data.port;
                shareUrl = 'http://' + ip + ':' + port + '/view';
                shareUrlEl.textContent = shareUrl;
            }
        } catch (err) {
            shareUrl = window.location.origin + '/view';
            shareUrlEl.textContent = shareUrl;
        }
    }

    // ---- Copiar link ----
    copyLinkBtn.addEventListener('click', async function () {
        const url = shareUrl || (window.location.origin + '/view');

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                fallbackCopy(url);
            }

            // Feedback visual
            copyIcon.style.display = 'none';
            checkIcon.style.display = 'block';
            copyLinkText.textContent = 'Link Copiado!';
            showToast('Link copiado para a área de transferência!');

            setTimeout(() => {
                copyIcon.style.display = 'block';
                checkIcon.style.display = 'none';
                copyLinkText.textContent = 'Copiar Link de Compartilhamento';
            }, 2500);
        } catch (err) {
            fallbackCopy(url);
            showToast('Link copiado!');
        }
    });

    // ---- Logout ----
    logoutBtn.addEventListener('click', async function () {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (err) { /* Ignorar */ }
        window.location.href = '/login.html';
    });

    // ---- Utilitários ----
    function fallbackCopy(text) {
        const ta = document.createElement('textarea');
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
        setTimeout(() => toastEl.classList.remove('show'), 2500);
    }

    // ---- Inicializar ----
    loadText();
    loadShareInfo();
})();
