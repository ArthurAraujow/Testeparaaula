// ============================================
//  Login Page - Lógica de autenticação
// ============================================

(function () {
    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('error-msg');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Verificar se já está logado
    fetch('/api/auth/check')
        .then(res => res.json())
        .then(data => {
            if (data.authenticated) {
                window.location.href = '/admin.html';
            }
        })
        .catch(() => { /* Ignorar erros */ });

    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errorEl.style.display = 'none';

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showError('Insira o usuário e a senha');
            return;
        }

        // Desabilitar botão durante o login
        submitBtn.disabled = true;
        submitBtn.textContent = 'Entrando...';

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();

            if (data.success) {
                window.location.href = '/admin.html';
            } else {
                showError(data.message || 'Usuário ou senha incorretos');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Entrar';
            }
        } catch (err) {
            showError('Erro ao conectar com o servidor');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Entrar';
        }
    });

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    }
})();
