import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  doc,
  setDoc,
  serverTimestamp,
} from './firebase.js';

export const NICKNAME_MAX = 12;

// 가입 도중(계정은 생겼지만 프로필 문서는 아직 없는 순간)인지 app.js가 알 수 있게
let signingUp = false;
export const isSigningUp = () => signingUp;

export function createProfile(user, nickname) {
  return setDoc(doc(db, 'users', user.uid), {
    nickname,
    email: user.email,
    groupId: null,
    createdAt: serverTimestamp(),
  });
}

export async function signUp({ nickname, email, password }) {
  signingUp = true;
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName: nickname });
    await createProfile(user, nickname);
  } finally {
    signingUp = false;
  }
}

export function logIn({ email, password }) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export function logOut() {
  return signOut(auth);
}

export function validateNickname(value) {
  const nickname = value.trim();
  if (!nickname) return '닉네임을 입력해 주세요';
  if (nickname.length > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자까지 쓸 수 있어요`;
  return '';
}

// Firebase 에러 코드를 쉬운 한국어로
const MESSAGES = {
  'auth/invalid-email': '이메일 형식이 올바르지 않아요',
  'auth/missing-email': '이메일을 입력해 주세요',
  'auth/missing-password': '비밀번호를 입력해 주세요',
  'auth/wrong-password': '비밀번호가 맞지 않아요',
  'auth/user-not-found': '가입되지 않은 이메일이에요',
  // 요즘 Firebase는 보안상 "이메일 없음"과 "비밀번호 틀림"을 구분해 주지 않아요.
  'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요',
  'auth/invalid-login-credentials': '이메일 또는 비밀번호가 맞지 않아요',
  'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요',
  'auth/weak-password': '비밀번호는 6자 이상으로 만들어 주세요',
  'auth/password-does-not-meet-requirements': '비밀번호는 6자 이상으로 만들어 주세요',
  'auth/too-many-requests': '시도가 너무 많았어요. 잠시 후 다시 해주세요',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요',
  'auth/user-disabled': '사용할 수 없는 계정이에요',
  'permission-denied': '권한이 없어요. 다시 로그인해 주세요',
  unavailable: '인터넷 연결을 확인해 주세요',
};

export function errorMessage(error) {
  if (error?.userMessage) return error.userMessage; // group.js 등에서 직접 만든 안내
  console.error(error);
  return MESSAGES[error?.code] ?? '문제가 생겼어요. 잠시 후 다시 해주세요';
}
