// app.js

document.addEventListener('DOMContentLoaded', () => {
  // UI refs
  const authSection    = document.getElementById('auth-section');
  const dataSection    = document.getElementById('data-section');
  const customCalc     = document.getElementById('custom-calculator');
  const historySection = document.getElementById('history-section');
  const historyTbody   = document.getElementById('history-tbody');
  const btnLogin       = document.getElementById('btn-login');
  const btnSignup      = document.getElementById('btn-signup');
  const btnGenerate    = document.getElementById('btn-generate');
  const btnLogout      = document.getElementById('btn-logout');
  const btnReset       = document.getElementById('btn-reset');
  const btnCustom      = document.getElementById('custom-btn');

  // Firebase
  const auth = firebase.auth();
  const db   = firebase.firestore();

  let currentUser   = null;
  window._coeffRbc  = { a: 0, b: 0 };
  window._coeffHct  = { c: 0, d: 0 };

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
    [authSection, dataSection, customCalc, historySection].forEach(s => s.classList.add('hidden'));
    section.classList.remove('hidden');
  }

  // Load and render conversion history
  function loadHistory() {
    if (!currentUser) return;
    historyTbody.innerHTML = '';
    db.collection('history')
      .where('userId', '==', currentUser.uid)
      .orderBy('timestamp', 'desc')
      .get({ source: 'server' })
      .then(snapshot => {
        snapshot.forEach(doc => {
          const { timestamp, hgb, rbc, hct } = doc.data();
          const date = timestamp
            ? timestamp.toDate().toLocaleString()
            : '';
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="border px-2 py-1">${date}</td>
            <td class="border px-2 py-1">${hgb}</td>
            <td class="border px-2 py-1">${rbc.toFixed(2)}</td>
            <td class="border px-2 py-1">${hct.toFixed(1)}</td>
          `;
          historyTbody.appendChild(tr);
        });
        historySection.classList.remove('hidden');
      })
      .catch(err => console.error('Error loading history:', err));
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

  btnLogout.addEventListener('click', () => auth.signOut());

  btnReset.addEventListener('click', () => {
    if (!currentUser) {
      resetCoefficients();
      clearHbInputs();
      clearDataInputs();
      showOnly(dataSection);
      return;
    }
    // delete saved formula and history
    db.collection('formulas').doc(currentUser.uid).delete();
    db.collection('history').where('userId','==',currentUser.uid)
      .get().then(snap => {
        const batch = db.batch();
        snap.forEach(d => batch.delete(d.ref));
        return batch.commit();
      });
    resetCoefficients();
    clearHbInputs();
    clearDataInputs();
    historyTbody.innerHTML = '';
    historySection.classList.add('hidden');
    alert('Your saved formula and history have been reset.');
    showOnly(dataSection);
  });

  // --- Auth State Changes ---
  auth.onAuthStateChanged(user => {
    currentUser = user;
    resetCoefficients();
    clearHbInputs();
    clearDataInputs();
    historyTbody.innerHTML = '';
    historySection.classList.add('hidden');

    if (!user) {
      btnLogout.classList.add('hidden');
      showOnly(authSection);
      return;
    }

    btnLogout.classList.remove('hidden');

    // load personal formula
    db.collection('formulas').doc(user.uid).get({ source: 'server' })
      .then(doc => {
        if (doc.exists) {
          Object.assign(window._coeffRbc, doc.data().coeffRbc);
          Object.assign(window._coeffHct, doc.data().coeffHct);
          showOnly(customCalc);
        } else {
          showOnly(dataSection);
        }
      })
      .then(loadHistory)
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

    // simple linear fit
    const n     = hgb.length;
    const mean  = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH    = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov   = (x,y) => x.reduce((s,v,i)=>s+(v-μH)*(y[i]-mean(y)),0)/n;
    const varH  = cov(hgb,hgb);

    window._coeffRbc.a = cov(hgb,rbc)/varH;
    window._coeffRbc.b = μR - window._coeffRbc.a * μH;
    window._coeffHct.c = cov(hgb,hct)/varH;
    window._coeffHct.d = μC - window._coeffHct.c * μH;

    if (currentUser) {
      db.collection('formulas').doc(currentUser.uid)
        .set({ coeffRbc: window._coeffRbc, coeffHct: window._coeffHct })
        .catch(err => console.error('Save error:', err));
    }

    clearHbInputs();
    showOnly(customCalc);
  });

  // --- Store each custom conversion in history ---
  if (btnCustom) {
    btnCustom.addEventListener('click', () => {
      const h = parseFloat(document.getElementById('custom-hgb').value);
      const r = window._coeffRbc.a*h + window._coeffRbc.b;
      const c = window._coeffHct.c*h + window._coeffHct.d;
      if (currentUser) {
        db.collection('history').add({
          userId: currentUser.uid,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          hgb: h,
          rbc: r,
          hct: c
        }).then(loadHistory);
      }
    });
  }
});
