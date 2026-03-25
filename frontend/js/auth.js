// ============================================
// AgriMind AI — Auth Module
// ============================================

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('login-error').textContent = '';
  document.getElementById('register-error').textContent = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '⏳ Logging in...';

  const { ok, data } = await AuthAPI.login({ phone, password });

  if (ok && data.success) {
    localStorage.setItem('agrimind_token', data.token);
    localStorage.setItem('agrimind_user', JSON.stringify(data.user));
    showToast('🎉 Welcome to AgriMind AI!', 'success');

    // ── Redirect based on role ──
    if (data.user.role === 'buyer') {
      window.location.href = 'indexseller.html';
    } else {
      initMainApp();
    }

  } else {
    errEl.textContent = data.message || 'Login failed';
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Login</span><span class="btn-loader hidden">⏳</span>';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;
  const role = document.getElementById('reg-role').value;
  const errEl = document.getElementById('register-error');
  errEl.textContent = '';

  if (phone.length !== 10 || !/^\d+$/.test(phone)) {
    errEl.textContent = 'Enter a valid 10-digit phone number';
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = '⏳ Registering...';

  const { ok, data } = await AuthAPI.register({ name, phone, password, role });

  if (ok && data.success) {
    localStorage.setItem('agrimind_token', data.token);
    localStorage.setItem('agrimind_user', JSON.stringify(data.user));
    showToast('✅ Registration successful!', 'success');

    // ── Redirect based on role ──
    if (data.user.role === 'buyer') {
      window.location.href = 'indexseller.html';
    } else {
      initMainApp();
    }

  } else {
    errEl.textContent = data.message || 'Registration failed';
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-text">Register</span><span class="btn-loader hidden">⏳</span>';
  }
}

function logout() {
  localStorage.removeItem('agrimind_token');
  localStorage.removeItem('agrimind_user');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('main-screen').classList.add('hidden');
  showToast('Logged out successfully', 'success');
}

function checkAuth() {
  const token = getToken();
  const user = getUser();

  if (token && user) {
    // ── If buyer somehow lands on index.html, redirect them ──
    if (user.role === 'buyer') {
      window.location.href = 'indexseller.html';
      return false;
    }
    initMainApp();
    return true;
  }

  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-screen').classList.add('active');
  return false;
}