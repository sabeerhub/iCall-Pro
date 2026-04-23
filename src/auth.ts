import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  onAuthStateChanged,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  runTransaction,
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from './db';

const provider = new GoogleAuthProvider();

export async function login() {
  return signInWithPopup(auth, provider);
}

export async function loginWithEmail(email: string, pass: string) {
  return signInWithEmailAndPassword(auth, email, pass);
}

export async function signupWithEmail(email: string, pass: string, name: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  await updateProfile(cred.user, { displayName: name });
  return cred;
}

export async function logout() {
  return signOut(auth);
}

export interface UserProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string;
  fcmToken?: string;
  onlineStatus: 'online' | 'offline';
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() as UserProfile : null;
}

export async function createUsername(uid: string, username: string, displayName: string) {
  const userRef = doc(db, 'users', uid);
  const usernameRef = doc(db, 'usernames', username.toLowerCase());

  return runTransaction(db, async (transaction) => {
    const usernameDoc = await transaction.get(usernameRef);
    if (usernameDoc.exists()) {
      throw new Error('Username already taken');
    }

    transaction.set(usernameRef, { userId: uid });
    transaction.set(userRef, {
      username: username.toLowerCase(),
      displayName,
      onlineStatus: 'online',
      createdAt: serverTimestamp()
    }, { merge: true });
  });
}

export async function updateFcmToken(uid: string, token: string) {
  const userRef = doc(db, 'users', uid);
  return setDoc(userRef, { fcmToken: token }, { merge: true });
}

export async function setUserStatus(uid: string, status: 'online' | 'offline') {
  const userRef = doc(db, 'users', uid);
  return setDoc(userRef, { 
    onlineStatus: status,
    lastSeen: serverTimestamp()
  }, { merge: true });
}

export function onAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      await setUserStatus(user.uid, 'online');
    }
    callback(user);
  });
}
