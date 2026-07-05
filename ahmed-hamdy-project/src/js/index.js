import { auth, onAuthStateChanged } from './firebase.js';

onAuthStateChanged(auth, (user) => {
  window.location.href = user ? './dashboard.html' : './login.html';
});
