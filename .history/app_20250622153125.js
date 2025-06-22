// app.js

document.addEventListener('DOMContentLoaded', () => {
  // --- UI REFERENCES ---
  const authSection    = document.getElementById('auth-section');
  const dataSection    = document.getElementById('data-section');
  const formulaSection = document.getElementById('formula-section');
  const predictSection = document.getElementById('predict-section');

  const btnLogin  = document.getElementById('btn-login');
  const btnSignup = document.getElementById('btn-signup');
  const btnGuest  = document.getElementById('btn-guest');      // ← define this!
  const btnLogout = document.getElementById('btn-logout');

  // --- FIREBASE SETUP ---
  const auth = firebase.auth();
  const db   = firebase.firestore();
  let currentUser = null;
  let coeffRbc = { a:0, b:0 }, coeffHct = { c:0, d:0 };

  // --- SECTION SWITCHER ---
  function showSection(section) {
    [authSection, dataSection, formulaSection, predictSection]
      .forEach(sec => sec.classList.add('hidden'));
    section.classList.remove('hidden');
  }
  function enterApp() { showSection(dataSection); }

  // --- AUTH LISTENERS ---
  btnSignup.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.createUserWithEmailAndPassword(email, pwd)
      .then(() => console.log('Signed up'))
      .catch(err => alert(err.message));
  });
  btnLogin.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.signInWithEmailAndPassword(email, pwd)
      .then(() => console.log('Logged in'))
      .catch(err => alert(err.message));
  });
  if (btnGuest) btnGuest.addEventListener('click', enterApp);
  if (btnLogout) btnLogout.addEventListener('click', () => auth.signOut());

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      if (btnLogout) btnLogout.classList.remove('hidden');
      enterApp();
      loadFormula();
    } else {
      if (btnLogout) btnLogout.classList.add('hidden');
      showSection(authSection);
    }
  });

  // --- FORMULA GENERATION ---
  document.getElementById('btn-generate').addEventListener('click', () => {
    const rows = document.querySelectorAll('#data-section tbody tr');
    const hgb = [], rbc = [], hct = [], mcv = [];
    rows.forEach(row => {
      const [ih, ir, ic, im] = row.querySelectorAll('input');
      const H = parseFloat(ih.value),
            R = parseFloat(ir.value),
            C = parseFloat(ic.value),
            M = parseFloat(im.value);
      if (![H,R,C,M].some(isNaN)) {
        hgb.push(H); rbc.push(R); hct.push(C); mcv.push(M);
      }
    });
    if (hgb.length < 2) {
      return alert('Please enter at least two complete data rows.');
    }
    const n = hgb.length;
    const mean = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov = (x,y) => x.reduce((s,v,i)=>s + (v-mean(x))*(y[i]-mean(y)),0)/n;
    const varH = cov(hgb,hgb);

    // Fit RBC = a·Hgb + b
    coeffRbc.a = cov(hgb,rbc)/varH;
    coeffRbc.b = μR - coeffRbc.a*μH;
    // Fit Hct = c·Hgb + d
    coeffHct.c = cov(hgb,hct)/varH;
    coeffHct.d = μC - coeffHct.c*μH;

    // Update UI
    document.getElementById('coef-rbc-a').innerText = coeffRbc.a.toFixed(4);
    document.getElementById('coef-rbc-b').innerText = coeffRbc.b.toFixed(4);
    document.getElementById('coef-hct-c').innerText = coeffHct.c.toFixed(4);
    document.getElementById('coef-hct-d').innerText = coeffHct.d.toFixed(4);

    showSection(formulaSection);
  });

  // --- SAVE & LOAD ---
  document.getElementById('btn-save').addEventListener('click', () => {
    if (!currentUser) return alert('Login to save your formula.');
    db.collection('formulas').doc(currentUser.uid)
      .set({ coeffRbc, coeffHct })
      .then(() => alert('Formula saved!'))
      .catch(err => alert(err.message));
  });
  function loadFormula() {
    if (!currentUser) return;
    db.collection('formulas').doc(currentUser.uid).get()
      .then(doc => {
        if (doc.exists) {
          Object.assign(coeffRbc, doc.data().coeffRbc);
          Object.assign(coeffHct, doc.data().coeffHct);
        }
      });
  }

  // --- PREDICTION ---
  document.getElementById('btn-predict').addEventListener('click', () => {
    const H = parseFloat(document.getElementById('input-hgb').value);
    if (isNaN(H)) return alert('Enter a valid Hemoglobin.');
    const r = coeffRbc.a*H + coeffRbc.b;
    const c = coeffHct.c*H + coeffHct.d;
    document.getElementById('prediction-result').innerText =
      `Predicted RBC: ${r.toFixed(2)} ×10⁶/µL\nHct: ${c.toFixed(1)}%`;
    showSection(predictSection);
  });
});
