import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './db';

export async function findUserByUsername(username: string) {
  const usernameRef = doc(db, 'usernames', username.toLowerCase());
  const snap = await getDoc(usernameRef);
  if (!snap.exists()) return null;
  
  const userId = snap.data().userId;
  const userSnap = await getDoc(doc(db, 'users', userId));
  return userSnap.exists() ? { uid: userId, ...userSnap.data() } : null;
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) throw new Error('You cannot add yourself');
  
  const requestId = `${senderId}_${receiverId}`;
  const requestRef = doc(db, 'friendRequests', requestId);
  
  return setDoc(requestRef, {
    senderId,
    receiverId,
    status: 'pending',
    createdAt: serverTimestamp()
  });
}

export async function acceptFriendRequest(requestId: string) {
  const requestRef = doc(db, 'friendRequests', requestId);
  const snap = await getDoc(requestRef);
  if (!snap.exists()) return;

  const { senderId, receiverId } = snap.data();
  const batch = writeBatch(db);

  // Update request status
  batch.update(requestRef, { status: 'accepted' });

  // Create bidirectional friendship
  batch.set(doc(db, 'friends', senderId, 'activeFriends', receiverId), { isFriend: true });
  batch.set(doc(db, 'friends', receiverId, 'activeFriends', senderId), { isFriend: true });

  return batch.commit();
}

export async function rejectFriendRequest(requestId: string) {
  const requestRef = doc(db, 'friendRequests', requestId);
  return setDoc(requestRef, { status: 'rejected' }, { merge: true });
}

export function subscribeToFriends(userId: string, callback: (friends: any[]) => void, onError?: (err: any) => void) {
  const friendUnsubs: Record<string, () => void> = {};
  const friendData: Record<string, any> = {};

  const mainUnsub = onSnapshot(collection(db, 'friends', userId, 'activeFriends'), (snap) => {
    const friendIds = snap.docs.map(d => d.id);
    
    // Remove old listeners
    Object.keys(friendUnsubs).forEach(id => {
      if (!friendIds.includes(id)) {
        friendUnsubs[id]();
        delete friendUnsubs[id];
        delete friendData[id];
      }
    });

    // Add new listeners
    friendIds.forEach(id => {
      if (!friendUnsubs[id]) {
        friendUnsubs[id] = onSnapshot(doc(db, 'users', id), (uSnap) => {
          if (uSnap.exists()) {
            friendData[id] = { uid: id, ...uSnap.data() };
            // Trigger callback with all gathered data
            callback(Object.values(friendData));
          }
        }, err => console.error(`Error listening to friend ${id}:`, err));
      }
    });

    if (friendIds.length === 0) callback([]);
  }, (err) => {
    if (onError) onError(err);
  });

  return () => {
    mainUnsub();
    Object.values(friendUnsubs).forEach(unsub => unsub());
  };
}

export function subscribeToRequests(userId: string, callback: (requests: any[]) => void, onError?: (err: any) => void) {
  const q = query(collection(db, 'friendRequests'), where('receiverId', '==', userId), where('status', '==', 'pending'));
  return onSnapshot(q, async (snap) => {
    try {
      const requestPromises = snap.docs.map(async (d) => {
        const data = d.data();
        const senderSnap = await getDoc(doc(db, 'users', data.senderId));
        return { id: d.id, sender: { uid: data.senderId, ...senderSnap.data() }, ...data };
      });
      const requests = await Promise.all(requestPromises);
      callback(requests);
    } catch (err) {
      if (onError) onError(err);
    }
  }, (err) => {
    if (onError) onError(err);
  });
}

export async function checkFriendship(userId: string, targetId: string) {
  const ref = doc(db, 'friends', userId, 'activeFriends', targetId);
  const snap = await getDoc(ref);
  return snap.exists();
}

export function subscribeToHistory(userId: string, callback: (history: any[]) => void, onError?: (err: any) => void) {
  const q = query(
    collection(db, 'callHistory'), 
    where('participants', 'array-contains', userId)
  );

  return onSnapshot(q, (snap) => {
    const history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    history.sort((a: any, b: any) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
    callback(history);
  }, (err) => {
    if (onError) onError(err);
  });
}
