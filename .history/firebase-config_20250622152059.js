// Paste your Firebase project configuration here
// Example config:
const firebaseConfig = {
  apiKey: "AIzaSyAZ3QVcn7vuqP4fb1NfqhN3d4QQ0XwTdE0",
  authDomain: "hemoglobin-rbc-metrics.firebaseapp.com",
  projectId: "hemoglobin-rbc-metrics",
  storageBucket: "hemoglobin-rbc-metrics.firebasestorage.app",
  messagingSenderId: "393224344418",
  appId: "1:393224344418:web:ec82c723c26a797fae123b",
  measurementId: "G-ZFKYVDTPKE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);