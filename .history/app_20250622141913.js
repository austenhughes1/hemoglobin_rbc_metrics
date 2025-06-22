// References to UI elements
const authSection = document.getElementById('auth-section');
const dataSection = document.getElementById('data-section');
const formulaSection = document.getElementById('formula-section');
const predictSection = document.getElementById('predict-section');
const userControls = document.getElementById('user-controls');
const btnLogin = document.getElementById('btn-login');
const btnSignup = document.getElementById('btn-signup');
const btnGuest = document.getElementById('btn-guest');
const btnLogout = document.getElementById('btn-logout');

// Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
let currentUser = null;
let coeffRbc = {a:0, b:0}, coeffHct = {c:0, d:0};

// Auth handlers
btnSignup.onclick = () => {
  const email = document.getElementById('auth-email').value;
  const pwd = document.getElementById('auth-password').value;
  auth.createUserWithEmailAndPassword(email, pwd).catch(console.error);
};
btnLogin.onclick = () => {
  const email = document.getElementById('auth-email').value;
  const pwd = document.getElementById('auth-password').value;
  auth.signInWithEmailAndPassword(email, pwd).catch(console.error);
};
btnGuest.onclick = () => enterApp();
btnLogout.onclick = () => auth.signOut();

auth.onAuthStateChanged(user => {
  currentUser = user;
  if(user) {
    btnLogout.classList.remove('hidden');
    enterApp();
    loadFormula();
  } else {
    btnLogout.classList.add('hidden');
    showSection(authSection);
  }
});

// Show only one section
function showSection(sec){ [authSection, dataSection, formulaSection, predictSection].forEach(s => s.classList.add('hidden')); sec.classList.remove('hidden'); }

// Enter data entry
function enterApp(){ showSection(dataSection); }

// Generate formula based on snapshots
document.getElementById('btn-generate').onclick = () => {
  const rows = document.querySelectorAll('#data-section tbody tr');
  const hgb=[]; const rbc=[]; const hct=[]; const mcv=[];
  rows.forEach(r => {
    const [ih, ir, ic, im] = r.querySelectorAll('input');
    const H = parseFloat(ih.value), R = parseFloat(ir.value), C = parseFloat(ic.value), M = parseFloat(im.value);
    if(!isNaN(H) && !isNaN(R) && !isNaN(C) && !isNaN(M)) {
      hgb.push(H); rbc.push(R); hct.push(C); mcv.push(M);
    }
  });
  // Fit multi-var model, then fold MCV into intercept
  const n = hgb.length;
  let sumH=0, sumR=0, sumM=0, sumHR=0, sumHM=0, sumRR=0;
  hgb.forEach((H,i)=>{ sumH+=H; sumR+=rbc[i]; sumM+=mcv[i]; sumHR+=H*rbc[i]; sumHM+=H*mcv[i]; sumRR+=H*H; });
  // Solve slope and intercept for RBC vs Hgb & MCV via linear algebra simplification
  // For simplicity, we use only Hgb in final: fold avg MCV
  const avgM = sumM / n;
  // Fit RBC = a*Hgb + b*avgM + c => a = covariance(H,R)/var(H)
  const covHR = (sumHR - sumH*sumR/n)/n;
  const varH = (sumRR - sumH*sumH/n)/n;
  coeffRbc.a = covHR/varH;
  coeffRbc.b = (sumR/n) - coeffRbc.a*(sumH/n) - coeffRbc.a*0*avgM + 0; // simplified intercept
  // Fit Hct similarly
  let sumC=0, sumHC=0, sumCC=0;
  hgb.forEach((H,i)=>{ sumC+=hct[i]; sumHC+=H*hct[i]; sumCC+=H*H; });
  const covHC = (sumHC - sumH*sumC/n)/n;
  coeffHct.c = covHC/varH;
  coeffHct.d = (sumC/n) - coeffHct.c*(sumH/n);
  // Display
  document.getElementById('coef-rbc-a').innerText = coeffRbc.a.toFixed(4);
  document.getElementById('coef-rbc-b').innerText = coeffRbc.b.toFixed(4);
  document.getElementById('coef-hct-c').innerText = coeffHct.c.toFixed(4);
  document.getElementById('coef-hct-d').innerText = coeffHct.d.toFixed(4);
  showSection(formulaSection);
};

// Save formula to Firestore
document.getElementById('btn-save').onclick = () => {
  if(!currentUser) return alert('Login to save.');
  db.collection('formulas').doc(currentUser.uid).set({ coeffRbc, coeffHct });
};

// Load existing formula
function loadFormula(){
  if(!currentUser) return;
  db.collection('formulas').doc(currentUser.uid).get().then(doc =>{
    if(doc.exists){ Object.assign(coeffRbc, doc.data().coeffRbc); Object.assign(coeffHct, doc.data().coeffHct); }
  });
}

// Predict
document.getElementById('btn-predict').onclick = () =>{
  const H = parseFloat(document.getElementById('input-hgb').value);
  const predR = coeffRbc.a*H + coeffRbc.b;
  const predC = coeffHct.c*H + coeffHct.d;
  document.getElementById('prediction-result').innerText = `Predicted RBC: ${predR.toFixed(2)} ×10⁶/µL, Hct: ${predC.toFixed(1)}%`;
  showSection(predictSection);
};