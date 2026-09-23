// Background items use static CSS positioning in style.css to eliminate layout shifts (CLS = 0)

  // Handle Auth UI for non-index pages
  const navLoginBtn = document.getElementById('navLoginBtn');
  const navSignupBtn = document.getElementById('navSignupBtn');
  const navLogoutBtn = document.getElementById('navLogoutBtn');
  const authLoggedOut = document.getElementById('authLoggedOut');
  const authLoggedIn = document.getElementById('authLoggedIn');
  const navUserEmail = document.getElementById('navUserEmail');

  if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
    const token = sessionStorage.getItem('labdrop_token');
    
    if (token && authLoggedOut && authLoggedIn) {
      authLoggedOut.style.display = 'none';
      authLoggedIn.style.display = 'flex';
      
      fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          if (navUserEmail) navUserEmail.textContent = data.user.email;
        })
        .catch(() => {
          sessionStorage.removeItem('labdrop_token');
          authLoggedOut.style.display = 'flex';
          authLoggedIn.style.display = 'none';
        });
    }

    const hasModal = !!document.getElementById('authModal');
    if (navLoginBtn && !hasModal) {
      navLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/?action=login';
      });
    }
    
    if (navSignupBtn && !hasModal) {
      navSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/?action=signup';
      });
    }

    if (navLogoutBtn) {
      navLogoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        sessionStorage.removeItem('labdrop_token');
        window.location.reload();
      });
    }
  }

