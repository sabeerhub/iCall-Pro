import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  serverTimestamp,
  getDoc,
  query,
  where
} from 'firebase/firestore';
import { db } from './db';
import { checkFriendship } from './friends';

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

export class CallSession {
  pc: RTCPeerConnection;
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  callId: string | null = null;
  state: string = 'idle';

  constructor() {
    this.pc = new RTCPeerConnection(configuration);
  }

  async startLocalStream() {
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream.getTracks().forEach(track => this.pc.addTrack(track, this.localStream!));
    return this.localStream;
  }

  async createCall(callerId: string, receiverId: string) {
    // 1. Check friendship
    const isFriend = await checkFriendship(callerId, receiverId);
    if (!isFriend) throw new Error('NOT_FRIENDS');

    await this.startLocalStream();

    // 2. Create call document
    const callRef = doc(collection(db, 'calls'));
    this.callId = callRef.id;

    // 3. ICE collection
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'calls', this.callId!, 'candidates'), {
          senderId: callerId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    // 4. Offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    await setDoc(callRef, {
      callerId,
      receiverId,
      state: 'calling',
      offer: { type: offer.type, sdp: offer.sdp },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return this.callId;
  }

  async answerCall(callId: string, receiverId: string) {
    this.callId = callId;
    const callRef = doc(db, 'calls', callId);
    const callSnap = await getDoc(callRef);
    if (!callSnap.exists()) return;

    await this.startLocalStream();

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        addDoc(collection(db, 'calls', this.callId!, 'candidates'), {
          senderId: receiverId,
          candidate: event.candidate.toJSON()
        });
      }
    };

    const offer = callSnap.data().offer;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      state: 'connected',
      connectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async getQualityStats() {
    try {
      const stats = await this.pc.getStats();
      let jitter = 0;
      let packetLoss = 0;
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          jitter = report.jitter * 1000; // to ms
          if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
            const total = report.packetsLost + report.packetsReceived;
            packetLoss = total > 0 ? (report.packetsLost / total) * 100 : 0;
          }
        }
      });
      
      return { jitter: Math.round(jitter), packetLoss: Math.round(packetLoss * 10) / 10 };
    } catch (e) {
      return { jitter: 0, packetLoss: 0 };
    }
  }

  async logHistory(state: 'ended' | 'declined' | 'missed' | 'rejected', durationSeconds: number = 0) {
    if (!this.callId) return;
    const callRef = doc(db, 'calls', this.callId);
    const snap = await getDoc(callRef);
    if (!snap.exists()) return;
    
    const data = snap.data();
    try {
      const callerSnap = await getDoc(doc(db, 'users', data.callerId));
      const receiverSnap = await getDoc(doc(db, 'users', data.receiverId));
      
      const historyEntry = {
        callerId: data.callerId,
        callerName: callerSnap.data()?.displayName || 'Unknown',
        callerUsername: callerSnap.data()?.username || 'unknown',
        receiverId: data.receiverId,
        receiverName: receiverSnap.data()?.displayName || 'Unknown',
        receiverUsername: receiverSnap.data()?.username || 'unknown',
        participants: [data.callerId, data.receiverId],
        state,
        duration: durationSeconds,
        timestamp: serverTimestamp()
      };

      await addDoc(collection(db, 'callHistory'), historyEntry);
    } catch (e) {
      console.error("Error logging history:", e);
    }
  }

  async hangup() {
    if (this.callId) {
      const callRef = doc(db, 'calls', this.callId);
      const snap = await getDoc(callRef);
      if (snap.exists()) {
        const data = snap.data();
        let duration = 0;
        if (data.connectedAt) {
          const start = data.connectedAt.toMillis();
          duration = Math.max(0, Math.floor((Date.now() - start) / 1000));
        }
        
        await updateDoc(callRef, { 
          state: 'ended',
          updatedAt: serverTimestamp()
        });
        
        await this.logHistory('ended', duration);
      }
    }
    this.cleanup();
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // returns true if muted
      }
    }
    return false;
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    this.pc.close();
    this.pc = new RTCPeerConnection(configuration);
  }
}

export function listenForCalls(userId: string, onIncoming: (callId: string, caller: any) => void, onError?: (err: any) => void) {
  const q = query(collection(db, 'calls'), where('receiverId', '==', userId));
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type === 'added' || change.type === 'modified') {
        const data = change.doc.data();
        if (data.receiverId === userId && data.state === 'calling') {
          try {
            const callerSnap = await getDoc(doc(db, 'users', data.callerId));
            onIncoming(change.doc.id, { uid: data.callerId, ...callerSnap.data() });
            updateDoc(change.doc.ref, { state: 'ringing', updatedAt: serverTimestamp() });
          } catch (err) {
            if (onError) onError(err);
          }
        }
      }
    });
  }, (err) => {
    if (onError) onError(err);
  });
}
