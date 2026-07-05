import { auth, signInWithEmailAndPassword, onAuthStateChanged } from './firebase.js';

// Redirect to dashboard if already logged in
onAuthStateChanged(auth, (user) => {
  if (user) window.location.href = './dashboard.html';
});

const form   = document.getElementById('login-form');
const errEl  = document.getElementById('error-msg');
const btnTxt = document.getElementById('btn-text');

const MESSAGES = {
  'auth/invalid-credential': 'بريد إلكتروني أو كلمة مرور غير صحيحة',
  'auth/user-not-found':     'المستخدم غير موجود',
  'auth/wrong-password':     'كلمة المرور غير صحيحة',
  'auth/too-many-requests':  'تم تجاوز عدد المحاولات، حاول لاحقاً',
  'auth/network-request-failed': 'خطأ في الاتصال بالإنترنت',
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.classList.remove('show');
  btnTxt.textContent = 'جاري الدخول...';

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = './dashboard.html';
  } catch (err) {
    errEl.textContent = MESSAGES[err.code] || 'حدث خطأ، حاول مرة أخرى';
    errEl.classList.add('show');
    btnTxt.textContent = 'تسجيل الدخول';
  }
});
