import { auth, onAuthStateChanged } from './firebase.js';

/**
 * Redirects to login if not authenticated. Resolves with user if logged in.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        resolve(user);
      } else {
        window.location.href = './login.html';
      }
    });
  });
}

/**
 * Redirects to dashboard if already authenticated. Resolves with null if not.
 */
export function redirectIfAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        window.location.href = './dashboard.html';
      } else {
        resolve(null);
      }
    });
  });
}
