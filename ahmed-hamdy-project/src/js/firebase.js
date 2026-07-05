import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from 'firebase/auth';
import {
  getFirestore, collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, limit, serverTimestamp, Timestamp, runTransaction, writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDQsaNVskKiV2cwPVlJDixpTD1S-Dhp7gs",
  authDomain: "reta-and-hamd.firebaseapp.com",
  projectId: "reta-and-hamd",
  storageBucket: "reta-and-hamd.firebasestorage.app",
  messagingSenderId: "220767743863",
  appId: "1:220767743863:web:2ecd37bd5830a39ec1bb72"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, limit, serverTimestamp, Timestamp, runTransaction, writeBatch
};
