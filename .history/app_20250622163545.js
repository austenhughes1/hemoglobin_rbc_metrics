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
  window._coeffRbc    = { a: 0, b: 0 };
  window._coeffHct    = { c: 0, d: 0 };

  // Clear all Hemoglobin inputs
  function clearHbInputs() {
    const g = document.getElementById('generic-hgb');
    const c = document.getElementById('custom-hgb');
    if (g) g.value = '';
    if (c) c.value = '';
  }

  // Reset coefficients to zero
  function resetCoefficients() {
    window._coeffRbc = { a: 0, b: 0 };
    window._coeffHct = { c: 0, d: 0 };
  }

  // Show exactly one of auth/data/custom
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

  btnGuest.addEventListener('click', () => {
    resetCoefficients();
    clearHbInputs();
    showOnly(dataSection);
  });

  btnLogout.addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(user => {
    currentUser = user;

    // Always reset & clear inputs on any auth change
    resetCoefficients();
    clearHbInputs();

    if (!user) {
      // Signed out
      btnLogout.classList.add('hidden');
      showOnly(authSection);
      return;
    }

    // Signed in
    btnLogout.classList.remove('hidden');

    // Fetch saved formula from SERVER (no cache)
    db.collection('formulas').doc(user.uid)
      .get({ source: 'server' })
      .then(doc => {
        if (doc.exists) {
          Object.assign(window._coeffRbc, doc.data().coeffRbc);
          Object.assign(window._coeffHct, doc.data().coeffHct);
          showOnly(customCalc);
        } else {
          showOnly(dataSection);
        }
      })
      .catch(err => {
        console.error('Error fetching formula:', err);
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

    // Compute linear fit (fold MCV into intercept)
    const n    = hgb.length;
    const mean = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH   = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov  = (x,y) => x.reduce((s,v,i)=>s + (v-μH)*(y[i]-mean(y)),0)/n;
    const varH = cov(hgb,hgb);

    window._coeffRbc.a = cov(hgb,rbc)/varH;
    window._coeffRbc.b = μR - window._coeffRbc.a * μH;
    window._coeffHct.c = cov(hgb,hct)/varH;
    window._coeffHct.d = μC - window._coeffHct.c * μH;

    // Save if signed in
    if (currentUser) {
      db.collection('formulas').doc(currentUser.uid)
        .set({
          coeffRbc: window._coeffRbc,
          coeffHct: window._coeffHct
        })
        .catch(err => console.error('Save error:', err));
    }

    clearHbInputs();
    showOnly(customCalc);
  });
});
