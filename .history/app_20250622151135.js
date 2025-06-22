// app.js

document.addEventListener('DOMContentLoaded', () => {
  // References to UI elements
  const authSection    = document.getElementById('auth-section');
  const dataSection    = document.getElementById('data-section');
  const formulaSection = document.getElementById('formula-section');
  const predictSection = document.getElementById('predict-section');

  const btnLogin  = document.getElementById('btn-login');
  const btnSignup = document.getElementById('btn-signup');
  const btnGuest  = document.getElementById('btn-guest');
  const btnLogout = document.getElementById('btn-logout');

  // Initialize Firebase services (firebase-config.js must run first)
  const auth = firebase.auth();
  const db   = firebase.firestore();

  // State
  let currentUser   = null;
  let coeffRbc      = { a: 0, b: 0 };
  let coeffHct      = { c: 0, d: 0 };

  // Helper: show exactly one section
  function showSection(section) {
    [authSection, dataSection, formulaSection, predictSection]
      .forEach(sec => sec.classList.add('hidden'));
    section.classList.remove('hidden');
  }

  // Enter the app (go to data entry)
  function enterApp() {
    showSection(dataSection);
  }

  // --- AUTH HANDLERS ---

  // Sign up
  btnSignup.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.createUserWithEmailAndPassword(email, pwd)
      .then(() => console.log('Signed up'))
      .catch(err => alert(err.message));
  });

  // Log in
  btnLogin.addEventListener('click', () => {
    const email = document.getElementById('auth-email').value;
    const pwd   = document.getElementById('auth-password').value;
    auth.signInWithEmailAndPassword(email, pwd)
      .then(() => console.log('Logged in'))
      .catch(err => alert(err.message));
  });

  // Continue as guest
  if (btnGuest) {
    btnGuest.addEventListener('click', () => enterApp());
  }

  // Log out (if button exists)
  if (btnLogout) {
    btnLogout.addEventListener('click', () => auth.signOut());
  }

  // React to auth state changes
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

    rows.forEach(r => {
      const [ih, ir, ic, im] = r.querySelectorAll('input');
      const H = parseFloat(ih.value),
            R = parseFloat(ir.value),
            C = parseFloat(ic.value),
            M = parseFloat(im.value);
      if (!isNaN(H) && !isNaN(R) && !isNaN(C) && !isNaN(M)) {
        hgb.push(H); rbc.push(R); hct.push(C); mcv.push(M);
      }
    });

    if (hgb.length < 2) {
      return alert('Enter at least two complete rows of data.');
    }

    // Simple one-variable fit (folding MCV into intercept behind the scenes)
    // Compute mean values and variances
    const n = hgb.length;
    const meanH = hgb.reduce((a,b)=>a+b,0)/n;
    const meanR = rbc.reduce((a,b)=>a+b,0)/n;
    const meanC = hct.reduce((a,b)=>a+b,0)/n;

    const covHR = hgb.reduce((sum,H,i)=>sum + (H-meanH)*(rbc[i]-meanR), 0) / n;
    const varH  = hgb.reduce((sum,H)=>sum + (H-meanH)*(H-meanH), 0) / n;

    coeffRbc.a = covHR/varH;
    coeffRbc.b = meanR - coeffRbc.a*meanH;

    const covHC = hgb.reduce((sum,H,i)=>sum + (H-meanH)*(hct[i]-meanC), 0) / n;
    coeffHct.c = covHC/varH;
    coeffHct.d = meanC - coeffHct.c*meanH;

    // Update the UI
    document.getElementById('coef-rbc-a').innerText = coeffRbc.a.toFixed(4);
    document.getElementById('coef-rbc-b').innerText = coeffRbc.b.toFixed(4);
    document.getElementById('coef-hct-c').innerText = coeffHct.c.toFixed(4);
    document.getElementById('coef-hct-d').innerText = coeffHct.d.toFixed(4);

    showSection(formulaSection);
  });

  // --- SAVE / LOAD ---

  document.getElementById('btn-save').addEventListener('click', () => {
    if (!currentUser) return alert('Please log in to save your formula.');
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
      })
      .catch(err => console.error(err));
  }

  // --- PREDICTION ---

  document.getElementById('btn-predict').addEventListener('click', () => {
    const H = parseFloat(document.getElementById('input-hgb').value);
    if (isNaN(H)) return alert('Please enter a valid Hemoglobin value.');
    const predR = coeffRbc.a * H + coeffRbc.b;
    const predC = coeffHct.c * H + coeffHct.d;
    document.getElementById('prediction-result').innerText =
      `Predicted RBC: ${predR.toFixed(2)} ×10⁶/µL\nHct: ${predC.toFixed(1)}%`;
    showSection(predictSection);
  });
});
