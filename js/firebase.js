// Firebase 초기화 (Auth + Firestore만 사용, Analytics는 쓰지 않음)
// 다른 파일은 CDN 주소 대신 여기서 필요한 함수를 가져다 씁니다.
// SDK 버전을 올릴 때는 아래 세 줄의 버전 숫자만 같이 바꾸면 됩니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  waitForPendingWrites,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCyTy_73VVVWMBPupXf4IsDm9Ggy_0-brk',
  authDomain: 'in2size.firebaseapp.com',
  projectId: 'in2size',
  storageBucket: 'in2size.firebasestorage.app',
  messagingSenderId: '663796362171',
  appId: '1:663796362171:web:1d46a64a77a7217438729e',
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
auth.languageCode = 'ko'; // 비밀번호 재설정 메일을 한국어로

// 오프라인 캐시를 켜서 앱을 다시 열 때 더 빨리 뜨게 합니다.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  doc,
  collection,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  waitForPendingWrites,
};
