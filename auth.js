/* ═══════════════════════════════════════════════════════
   AUTH.JS — Real authentication (talks to the CryptoKit backend)
   ═══════════════════════════════════════════════════════
   The backend (backend/ folder, Node + Express + MongoDB) is the
   source of truth. Login state lives in a secure HTTP-only session
   cookie that JavaScript cannot read.

   The 'cryptokit_auth' flag in storage is ONLY a UI hint so the page
   does not flash the wrong screen while loading. It never grants
   access to anything: on every page load we ask the server
   (GET /api/auth/me) and fix the screen if the flag was wrong.

   Open the site through the backend (http://localhost:3000), not by
   double-clicking the HTML file, so the session cookie works.
   ═══════════════════════════════════════════════════════ */

var AUTH_STORAGE_KEY = 'cryptokit_auth';
var AUTH_API_BASE = '/api/auth';

/* ──────────────────────────────────────
   Tiny API client
   Resolves with the JSON body, or rejects with an Error that has
   .status (HTTP code, 0 = could not reach server) and .code.
────────────────────────────────────── */
function authApi(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    return fetch(AUTH_API_BASE + path, opts).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
                var err = new Error(data.error || 'Request failed');
                err.status = res.status;
                err.code = data.code;
                throw err;
            }
            return data;
        });
    }, function () {
        var err = new Error('Cannot reach the server. Open the site at http://localhost:3000 and make sure the backend is running.');
        err.status = 0;
        throw err;
    });
}

function setSubmitting(formId, busy) {
    var form = document.getElementById(formId);
    var btn = form && form.querySelector('button[type="submit"]');
    if (btn) btn.disabled = !!busy;
}

/* Small message that works on any screen (used after email verification) */
function showToast(type, message) {
    var el = document.createElement('div');
    el.textContent = message;
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100000;' +
        'padding:12px 18px;border-radius:10px;font:600 14px system-ui,sans-serif;color:#fff;max-width:90vw;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.35);background:' + (type === 'success' ? '#16a34a' : '#dc2626');
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
}

/* ──────────────────────────────────────
   Screen switching: auth screen <-> main app
────────────────────────────────────── */
function showMainApp() {
    var authScreen = document.getElementById('authScreen');
    var mainApp     = document.getElementById('mainApp');
    if (authScreen) authScreen.classList.add('auth-screen-hidden');
    if (mainApp)    mainApp.classList.remove('main-app-hidden');

    var loginBtn  = document.getElementById('navLoginBtn');
    var logoutBtn = document.getElementById('navLogoutBtn');
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'inline-flex';
}

function showAuthScreen() {
    var authScreen = document.getElementById('authScreen');
    var mainApp     = document.getElementById('mainApp');
    if (mainApp)    mainApp.classList.add('main-app-hidden');
    if (authScreen) authScreen.classList.remove('auth-screen-hidden');

    var loginBtn  = document.getElementById('navLoginBtn');
    var logoutBtn = document.getElementById('navLogoutBtn');
    if (loginBtn)  loginBtn.style.display  = '';
    if (logoutBtn) logoutBtn.style.display = 'none';

    switchAuthPanel('login');
}

/* ──────────────────────────────────────
   UI hint flag (NOT real authentication — see top of file)
────────────────────────────────────── */
function setAuthenticated(isAuthed, remember) {
    try {
        if (isAuthed) {
            if (remember) {
                localStorage.setItem(AUTH_STORAGE_KEY, 'true');
                sessionStorage.removeItem(AUTH_STORAGE_KEY);
            } else {
                sessionStorage.setItem(AUTH_STORAGE_KEY, 'true');
                localStorage.removeItem(AUTH_STORAGE_KEY);
            }
        } else {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            sessionStorage.removeItem(AUTH_STORAGE_KEY);
        }
    } catch (e) {
        /* Storage may be unavailable (e.g. private mode) — harmless, the server session still works. */
    }
}

function isAuthenticated() {
    try {
        return sessionStorage.getItem(AUTH_STORAGE_KEY) === 'true' ||
               localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
    } catch (e) {
        return false;
    }
}

/* ──────────────────────────────────────
   Login <-> Sign Up panel toggle
────────────────────────────────────── */
function switchAuthPanel(which) {
    var loginPanel  = document.getElementById('loginPanel');
    var signupPanel = document.getElementById('signupPanel');
    if (!loginPanel || !signupPanel) return;

    clearFormErrors('loginForm');
    clearFormErrors('signupForm');
    hideBanner('loginBanner');
    hideBanner('signupBanner');

    if (which === 'signup') {
        loginPanel.classList.remove('active');
        signupPanel.classList.add('active');
    } else {
        signupPanel.classList.remove('active');
        loginPanel.classList.add('active');
    }
}

/* ──────────────────────────────────────
   Show / hide password
────────────────────────────────────── */
function togglePasswordVisibility(inputId, btn) {
    var input = document.getElementById(inputId);
    if (!input) return;

    var icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        input.classList.add('auth-pw-as-text');
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
        btn.setAttribute('aria-label', 'Hide password');
    } else {
        input.type = 'password';
        input.classList.remove('auth-pw-as-text');
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
        btn.setAttribute('aria-label', 'Show password');
    }
}

/* ──────────────────────────────────────
   Validation helpers
────────────────────────────────────── */
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function setFieldError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.add('auth-input-error');
    if (error) { error.textContent = message; error.classList.add('show'); }
}

function clearFieldError(inputId, errorId) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) input.classList.remove('auth-input-error');
    if (error) { error.textContent = ''; error.classList.remove('show'); }
}

function clearFormErrors(formId) {
    var form = document.getElementById(formId);
    if (!form) return;
    var errs = form.querySelectorAll('.auth-error');
    for (var i = 0; i < errs.length; i++) {
        errs[i].textContent = '';
        errs[i].classList.remove('show');
    }
    var inputs = form.querySelectorAll('.auth-input');
    for (var j = 0; j < inputs.length; j++) {
        inputs[j].classList.remove('auth-input-error');
    }
}

function showBanner(id, type, message) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = 'auth-banner show ' + type;
}

function hideBanner(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.className = 'auth-banner';
}

/* ──────────────────────────────────────
   Login form
────────────────────────────────────── */
function handleLogin(event) {
    event.preventDefault();
    clearFormErrors('loginForm');
    hideBanner('loginBanner');

    var email    = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var remember = document.getElementById('rememberMe').checked;
    var valid    = true;

    if (!email) {
        setFieldError('loginEmail', 'loginEmailError', 'Email is required.');
        valid = false;
    } else if (!isValidEmail(email)) {
        setFieldError('loginEmail', 'loginEmailError', 'Enter a valid email address.');
        valid = false;
    }

    if (!password) {
        setFieldError('loginPassword', 'loginPasswordError', 'Password is required.');
        valid = false;
    }

    if (!valid) {
        showBanner('loginBanner', 'error', 'Please fix the highlighted fields.');
        return false;
    }

    setSubmitting('loginForm', true);
    authApi('POST', '/login', { email: email, password: password, remember: remember })
        .then(function () {
            setAuthenticated(true, remember);
            showBanner('loginBanner', 'success', 'Login successful — loading CryptoKit…');
            setTimeout(function () {
                showMainApp();
                var f = document.getElementById('loginForm');
                if (f) f.reset();
            }, 500);
        })
        .catch(function (err) {
            var type = (err.code === 'EMAIL_NOT_VERIFIED') ? 'info' : 'error';
            showBanner('loginBanner', type, err.message);
        })
        .then(function () { setSubmitting('loginForm', false); });

    return false;
}

/* ──────────────────────────────────────
   Sign Up form
────────────────────────────────────── */
function handleSignup(event) {
    event.preventDefault();
    clearFormErrors('signupForm');
    hideBanner('signupBanner');

    var name            = document.getElementById('signupName').value.trim();
    var email           = document.getElementById('signupEmail').value.trim();
    var password        = document.getElementById('signupPassword').value;
    var confirmPassword = document.getElementById('signupConfirmPassword').value;
    var valid           = true;

    if (!name) {
        setFieldError('signupName', 'signupNameError', 'Name is required.');
        valid = false;
    } else if (name.length < 2) {
        setFieldError('signupName', 'signupNameError', 'Name must be at least 2 characters.');
        valid = false;
    }

    if (!email) {
        setFieldError('signupEmail', 'signupEmailError', 'Email is required.');
        valid = false;
    } else if (!isValidEmail(email)) {
        setFieldError('signupEmail', 'signupEmailError', 'Enter a valid email address.');
        valid = false;
    }

    if (!password) {
        setFieldError('signupPassword', 'signupPasswordError', 'Password is required.');
        valid = false;
    } else if (password.length < 8) {
        setFieldError('signupPassword', 'signupPasswordError', 'Password must be at least 8 characters.');
        valid = false;
    }

    if (!confirmPassword) {
        setFieldError('signupConfirmPassword', 'signupConfirmPasswordError', 'Please confirm your password.');
        valid = false;
    } else if (password && confirmPassword !== password) {
        setFieldError('signupConfirmPassword', 'signupConfirmPasswordError', 'Passwords do not match.');
        valid = false;
    }

    if (!valid) {
        showBanner('signupBanner', 'error', 'Please fix the highlighted fields.');
        return false;
    }

    setSubmitting('signupForm', true);
    authApi('POST', '/register', { name: name, email: email, password: password })
        .then(function () {
            setAuthenticated(true, false);
            showBanner('signupBanner', 'success', 'Account created — check your email to verify it. Logging you in…');
            setTimeout(function () {
                showMainApp();
                var f = document.getElementById('signupForm');
                if (f) f.reset();
            }, 900);
        })
        .catch(function (err) {
            if (err.status === 409) {
                setFieldError('signupEmail', 'signupEmailError', err.message);
                showBanner('signupBanner', 'error', 'Please fix the highlighted fields.');
            } else {
                showBanner('signupBanner', 'error', err.message);
            }
        })
        .then(function () { setSubmitting('signupForm', false); });

    return false;
}

/* ──────────────────────────────────────
   Forgot password (uses the email typed in the login form)
────────────────────────────────────── */
function handleForgotPassword() {
    clearFormErrors('loginForm');
    hideBanner('loginBanner');

    var email = document.getElementById('loginEmail').value.trim();
    if (!email || !isValidEmail(email)) {
        setFieldError('loginEmail', 'loginEmailError', 'Enter your email here first, then click "Forgot password?".');
        return;
    }

    authApi('POST', '/forgot-password', { email: email })
        .then(function (data) {
            showBanner('loginBanner', 'success', data.message || 'If that email is registered, a reset link has been sent.');
        })
        .catch(function (err) {
            showBanner('loginBanner', 'error', err.message);
        });
}

/* ──────────────────────────────────────
   Logout
   The screen changes immediately; the server session is destroyed
   in the background. If that fails we tell the user.
────────────────────────────────────── */
function handleLogout() {
    setAuthenticated(false, false);
    showAuthScreen();

    var loginForm  = document.getElementById('loginForm');
    var signupForm = document.getElementById('signupForm');
    if (loginForm)  loginForm.reset();
    if (signupForm) signupForm.reset();

    authApi('POST', '/logout').catch(function () {
        showBanner('loginBanner', 'error', 'Could not reach the server to finish logging out. Please try again.');
    });
}

/* ──────────────────────────────────────
   On load: ask the server who is logged in
────────────────────────────────────── */
function verifySession() {
    authApi('GET', '/me')
        .then(function () {
            if (!isAuthenticated()) setAuthenticated(true, false);
            showMainApp();
        })
        .catch(function (err) {
            if (err.status === 401) {
                /* No valid server session: the UI hint was stale or forged. */
                var hadFlag = isAuthenticated();
                setAuthenticated(false, false);
                if (hadFlag) showAuthScreen();
            }
            /* Network error: leave the screen as it is. */
        });
}

/* Message after clicking the link in the verification email (/?emailVerified=1 or 0) */
function showEmailVerifiedResult() {
    var m = /[?&]emailVerified=([01])/.exec(window.location.search);
    if (!m) return;
    if (m[1] === '1') showToast('success', 'Email verified. Thank you!');
    else showToast('error', 'This verification link is invalid or has expired.');
    if (window.history && history.replaceState) history.replaceState(null, '', window.location.pathname);
}

document.addEventListener('DOMContentLoaded', function () {
    /* index.html still says "Frontend preview only"; replace with the truth. */
    var note = document.querySelector('.auth-footnote');
    if (note) {
        note.innerHTML = '<i class="fas fa-circle-info"></i> Your password is hashed and stored securely. Crypto tool inputs never leave your browser.';
    }

    if (isAuthenticated()) {
        var loginBtn  = document.getElementById('navLoginBtn');
        var logoutBtn = document.getElementById('navLogoutBtn');
        if (loginBtn)  loginBtn.style.display  = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    }

    verifySession();
    showEmailVerifiedResult();
});
