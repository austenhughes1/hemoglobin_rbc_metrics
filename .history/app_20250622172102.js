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
  const btnReset         = document.getElementById('btn-reset');

  // Firebase
  const auth = firebase.auth();
  const db   = firebase.firestore();

  let currentUser     = null;
  window._coeffRbc    = { a: 0, b: 0 };
  window._coeffHct    = { c: 0, d: 0 };

  function resetCoefficients() {
    window._coeffRbc = { a: 0, b: 0 };
    window._coeffHct = { c: 0, d: 0 };
  }

  function clearHbInputs() {
    document.getElementById('generic-hgb').value = '';
    document.getElementById('custom-hgb').value  = '';
  }

  function clearDataInputs() {
    document.querySelectorAll('#data-section tbody input')
      .forEach(i => i.value = '');
  }

  function showOnly(section) {
    [authSection, dataSection, customCalc].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
  }

  // --- Auth Handlers ---
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
    clearDataInputs();
    showOnly(dataSection);
  });

  btnLogout.addEventListener('click', () => auth.signOut());

  btnReset.addEventListener('click', () => {
    if (!currentUser) {
      // just clear UI for guests
      resetCoefficients();
      clearHbInputs();
      clearDataInputs();
      showOnly(dataSection);
      return;
    }
    db.collection('formulas').doc(currentUser.uid).delete()
      .then(() => {
        resetCoefficients();
        clearHbInputs();
        clearDataInputs();
        alert('Your saved formula has been reset.');
        showOnly(dataSection);
      })
      .catch(err => alert('Reset failed: ' + err.message));
  });

  auth.onAuthStateChanged(user => {
    currentUser = user;
    resetCoefficients();
    clearHbInputs();
    clearDataInputs();

    if (!user) {
      btnLogout.classList.add('hidden');
      btnReset.classList.add('hidden');
      showOnly(authSection);
      return;
    }

    btnLogout.classList.remove('hidden');
    btnReset.classList.remove('hidden');

    // fetch fresh from server
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
      .catch(() => showOnly(dataSection));
  });

  // --- Generate & Save Formula ---
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

    // compute simple fit
    const n     = hgb.length;
    const mean  = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH    = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov   = (x,y) => x.reduce((s,v,i)=>s + (v-μH)*(y[i]-mean(y)),0)/n;
    const varH  = cov(hgb,hgb);

    window._coeffRbc.a = cov(hgb,rbc)/varH;
    window._coeffRbc.b = μR - window._coeffRbc.a * μH;
    window._coeffHct.c = cov(hgb,hct)/varH;
    window._coeffHct.d = μC - window._coeffHct.c * μH;

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
    // ← Unhide the Reset button now that the custom view is up:
    btnReset.classList.remove('hidden');
  });
});
