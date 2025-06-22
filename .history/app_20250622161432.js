document.addEventListener('DOMContentLoaded', () => {
  // UI refs
  const authSection    = document.getElementById('auth-section');
  const dataSection    = document.getElementById('data-section');
  const formulaSection = document.getElementById('formula-section'); // no longer shown
  const btnLogin       = document.getElementById('btn-login');
  const btnSignup      = document.getElementById('btn-signup');
  const btnGuest       = document.getElementById('btn-guest');
  const btnGenerate    = document.getElementById('btn-generate');

  // Firebase
  const auth = firebase.auth();
  const db   = firebase.firestore();

  let currentUser = null;
  // We’ll store these globally so the custom converter script can use them
  window._coeffRbc = {a:0, b:0};
  window._coeffHct = {c:0, d:0};

  function showSection(sec) {
    [authSection, dataSection].forEach(s => s.classList.add('hidden'));
    sec.classList.remove('hidden');
  }

  function enterApp() {
    showSection(dataSection);
  }

  // Auth handlers
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
  btnGuest.addEventListener('click', enterApp);

  auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
      enterApp();
      // load existing or new formula if any
      db.collection('formulas').doc(user.uid).get()
        .then(doc => {
          if (doc.exists) {
            Object.assign(window._coeffRbc, doc.data().coeffRbc);
            Object.assign(window._coeffHct, doc.data().coeffHct);
          }
        });
    } else {
      showSection(authSection);
    }
  });

  // Generate & save formula
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
      return alert('Enter at least two rows of complete data.');
    }
    // Simple one-var fit
    const n = hgb.length;
    const mean = arr => arr.reduce((s,v)=>s+v,0)/n;
    const μH = mean(hgb), μR = mean(rbc), μC = mean(hct);
    const cov = (x,y) => x.reduce((s,v,i)=>s+(v-mean(x))*(y[i]-mean(y)),0)/n;
    const varH = cov(hgb,hgb);

    window._coeffRbc.a = cov(hgb,rbc)/varH;
    window._coeffRbc.b = μR - window._coeffRbc.a*μH;
    window._coeffHct.c = cov(hgb,hct)/varH;
    window._coeffHct.d = μC - window._coeffHct.c*μH;

    // Save into Firestore (if logged in)
    if (currentUser) {
      db.collection('formulas').doc(currentUser.uid)
        .set({ coeffRbc: window._coeffRbc, coeffHct: window._coeffHct });
    }
    // Reveal custom converter
    document.getElementById('custom-calculator').classList.remove('hidden');
  });
});
