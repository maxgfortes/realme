// ===================
// CONFIGURAÇÕES DO FIREBASE
// ===================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  limit,
  startAfter,
  deleteDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  onDisconnect, 
  serverTimestamp,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appStorage.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

export { db, rtdb };