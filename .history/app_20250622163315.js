// app.js

document.addEventListener('DOMContentLoaded', () => {
  // UI refs
  const authSection      = document.getElementById('auth-section');
  const dataSection      = document.getElementById('data-section');
  const customCalc       = document.getElementById('custom-calculator');
  const btnLogin         = document.getElementById('btn-login');
  const btnSignup        = document.getElementById('btn-signup');
  const btnGuest         = document.getElementById('btn-guest');
  const btnGenerate      = document.getElementById('btn-generate');
  const btnLogout        = document.getElementById('btn-logout');

  // Firebase
  const auth = firebase.auth();
  const db   = firebase.firestore();

  let currentUser     = null;
  // Global storage for your coefficients
  window._coeffRbc    = { a: 0, b: 0 };
  window._coeffHct    = { c: 0, d: 0 };

  // Utility to zero them out
  function resetCoefficients() {
    window._coeffRbc = { a: 0, b: 0 };
    window._coeffHct = { c: 0, d: 0 };
  }

  // Show exactly one section
  function showOnly(section) {
    [authSection, dataSection, customCalc].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
  }

  // --- AUTH FLOW ---
  btnSignup.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.createUserWithEmailAndPassword(email, pwd)
      .catch(err => alert(err.message));
  });

  btnLogin.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.signInWithEmailAndPassword(email, pwd)
      .catch(err => alert(err.message));
  });

  btnGuest.addEventListener('click', () => showOnly(dataSection));
  btnLogout.addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(user => {
    currentUser = user;

    // Reset on every sign-in or sign-out
    resetCoefficients();

    if (!user) {
      // Signed out → hide logout, show login/signup
      btnLogout.classList.add('hidden');
      showOnly(authSection);
      return;
    }

    // Signed in → show logout
    btnLogout.classList.remove('hidden');

    // Fetch the user’s formula from the SERVER (avoid local caching)
    db.collection('formulas').doc(user.uid)
      .get({ source: 'server' })
      .then(doc => {
        if (doc.exists) {
          // Load into globals
          Object.assign(window._coeffRbc, doc.data().coeffRbc);
          Object.assign(window._coeffHct, doc.data().coeffHct);
          // Jump straight to custom converter
          showOnly(customCalc);
        } else {
          // No saved formula yet → show data-entry
          showOnly(dataSection);
        }
      })
      .catch(err => {
        console.error('Error fetching formula from server:', err);
        showOnly(dataSection);
      });
  });

  // --- GENERATE & SAVE FORMULA ---
  btnGenerate.addEventListener('click', () => {
    const rows = document.querySelectorAll('#data-section tbody tr');
    const hgb = [], rbc = [], hct = [], mcv = [];
    rows.forEach(r => {
      const [ih,ir,ic,im] = r.querySelectorAll('input');
      const H = parseFloat(ih.value),
            R = parseFloat(ir.value),
            C = parseFloat(ic.value),
            M = parseFloat(im.value);
      if (![H,R,C,M].some(isNaN)) {
        hgb.push(H); rbc.push(R); hct.push(C); mcv.push(M);
      }
    });
    if (hgb.length < 2) {
      return alert('Please enter at least two rows of complete data.');
    }

    // Compute simple linear fit
    const n     = hgb.length;
    const mean  = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH    = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov   = (x,y) => x.reduce((s,v,i)=>s+(v-μH)*(y[i]-mean(y)),0)/n;
    const varH  = cov(hgb,hgb);

    window._coeffRbc.a = cov(hgb,rbc)/varH;
    window._coeffRbc.b = μR - window._coeffRbc.a * μH;
    window._coeffHct.c = cov(hgb,hct)/varH;
    window._coeffHct.d = μC - window._coeffHct.c * μH;

    // Save to Firestore if signed in
    if (currentUser) {
      db.collection('formulas').doc(currentUser.uid)
        .set({
          coeffRbc: window._coeffRbc,
          coeffHct: window._coeffHct
        })
        .catch(err => console.error('Save error:', err));
    }

    // Reveal custom converter
    showOnly(customCalc);
  });
});
