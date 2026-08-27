document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.dec-item');
  if (!items.length) return;
  
  const width = window.innerWidth;
  const height = window.innerHeight;
  const margin = 80; // Keep icons away from the very edge
  
  const points = [];
  const numCandidates = 100; // High number of candidates ensures optimal spacing

  items.forEach((item) => {
    let bestPoint = null;
    let maxMinDist = -1;

    // Generate multiple random candidate points
    for (let i = 0; i < numCandidates; i++) {
      const candidate = {
        x: margin + Math.random() * (width - 2 * margin),
        y: margin + Math.random() * (height - 2 * margin)
      };

      // Find the distance to the closest existing point
      let minDist = Infinity;
      for (const p of points) {
        const dx = candidate.x - p.x;
        const dy = candidate.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
        }
      }

      // If this is the first point, any distance is fine
      if (points.length === 0) {
        bestPoint = candidate;
        break;
      }

      // Pick the candidate that is furthest away from its closest neighbor
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestPoint = candidate;
      }
    }

    points.push(bestPoint);
    
    // Random rotation for a scattered look
    const rot = Math.floor(Math.random() * 360);
    
    // Apply inline styles to override CSS rules
    item.style.position = 'absolute';
    // Use pixel values for exact placement, converted back to percentages for responsiveness
    item.style.left = `${(bestPoint.x / width) * 100}%`;
    item.style.top = `${(bestPoint.y / height) * 100}%`;
    item.style.bottom = 'auto';
    item.style.right = 'auto';
    item.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`;
  });
});

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

