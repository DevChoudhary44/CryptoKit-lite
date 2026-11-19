/* Tiny client for the CryptoKit backend. Load it BEFORE your auth.js:
   <script src="/_backend/auth-api.js"></script>
   Usage:  const { user } = await CryptoKitAuth.login(email, password);
   Every function throws an Error (with .status) whose message is safe to show to the user. */
(function () {
  async function call(method, path, body) {
    const res = await fetch('/api/auth' + path, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.code = data.code;
      throw err;
    }
    return data;
  }
  window.CryptoKitAuth = {
    register: (name, email, password) => call('POST', '/register', { name, email, password }),
    login: (email, password, remember) => call('POST', '/login', { email, password, remember: !!remember }),
    logout: () => call('POST', '/logout'),
    me: () => call('GET', '/me'),                       // rejects with status 401 when logged out
    forgotPassword: (email) => call('POST', '/forgot-password', { email }),
    resendVerification: () => call('POST', '/resend-verification'),
  };
})();
