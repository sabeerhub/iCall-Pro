import { 
  login, 
  loginWithEmail,
  signupWithEmail,
  logout, 
  onAuth, 
  getUserProfile, 
  createUsername, 
  updateFcmToken,
  setUserStatus,
  UserProfile
} from './auth';
import { 
  findUserByUsername, 
  sendFriendRequest, 
  subscribeToFriends, 
  subscribeToRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  subscribeToHistory
} from './friends';
import { CallSession, listenForCalls } from './calls';
import { requestNotificationPermission } from './db';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, collection, getDocFromServer } from 'firebase/firestore';
import { db } from './db';
import { auth as firebaseAuth } from './db';

async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_health_', 'connection'));
    console.log("Firestore connection verified.");
  } catch (error: any) {
    console.error("Firestore connectivity test failed:", error);
    if (error.code === 'resource-exhausted' || error.message?.includes('Quota exceeded')) {
      alert("Firestore Quota exceeded. Please try again tomorrow.");
    }
    
    if (error.message && (error.message.includes('offline') || error.message.includes('insufficient permissions') || error.message.includes('within 10 seconds'))) {
      console.warn("Firestore connectivity check:", error.message);
      const statusBadge = document.getElementById('connection-status-badge');
      if (statusBadge) {
        statusBadge.querySelector('span')!.textContent = 'Connectivity Restricted';
        statusBadge.querySelector('div')?.classList.replace('bg-green-500', 'bg-slate-700');
      }
    }
  }
}

testConnection();

export function handleFirestoreError(error: any, operationType: string, path: string | null = null) {
  const user = firebaseAuth.currentUser;
  const errorInfo = {
    error: error.message || String(error),
    operationType,
    path,
    authInfo: user ? {
      userId: user.uid,
      email: user.email || '',
      emailVerified: user.emailVerified,
      isAnonymous: user.isAnonymous,
      providerInfo: user.providerData.map(p => ({
        providerId: p.providerId,
        displayName: p.displayName || '',
        email: p.email || '',
      }))
    } : null
  };
  console.error("Firestore Error:", errorInfo);
  throw JSON.stringify(errorInfo);
}

// UI Elements
const screenAuth = document.getElementById('auth-screen')!;
const screenUsername = document.getElementById('username-screen')!;
const screenDashboard = document.getElementById('dashboard-screen')!;
const overlayIncoming = document.getElementById('incoming-call-overlay')!;
const overlayActive = document.getElementById('active-call-overlay')!;

const loginBtn = document.getElementById('login-btn')!;
const logoutBtn = document.getElementById('logout-btn')!;
const saveUsernameBtn = document.getElementById('save-username-btn') as HTMLButtonElement;
const usernameInput = document.getElementById('username-input') as HTMLInputElement;

const searchInput = document.getElementById('search-input') as HTMLInputElement;
const searchResults = document.getElementById('search-results')!;
const friendsList = document.getElementById('friends-list')!;
const requestsList = document.getElementById('requests-list')!;
const requestsContainer = document.getElementById('requests-container')!;

const sidebarToggle = document.getElementById('sidebar-toggle')!;
const sidebar = document.getElementById('sidebar')!;
const muteBtn = document.getElementById('mute-btn')!;
const muteLabel = document.getElementById('mute-label')!;
const muteIcon = document.getElementById('mute-icon')!;
const historyList = document.getElementById('history-list')!;

const incCallerName = document.getElementById('inc-caller-name')!;
const acceptBtn = document.getElementById('accept-btn')!;
const declineBtn = document.getElementById('decline-btn')!;

const activeCallerName = document.getElementById('active-caller-name')!;
const callStatus = document.getElementById('call-status')!;
const callTimer = document.getElementById('call-timer')!;
const hangupBtn = document.getElementById('hangup-btn')!;

const ringtoneAudio = document.getElementById('ringtone-audio') as HTMLAudioElement;
const waitingAudio = document.getElementById('waiting-audio') as HTMLAudioElement;

// Auth UI Elements
const tabLogin = document.getElementById('tab-login')!;
const tabSignup = document.getElementById('tab-signup')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const signupForm = document.getElementById('signup-form') as HTMLFormElement;

const loginEmail = document.getElementById('login-email') as HTMLInputElement;
const loginPass = document.getElementById('login-password') as HTMLInputElement;
const signupName = document.getElementById('signup-name') as HTMLInputElement;
const signupEmail = document.getElementById('signup-email') as HTMLInputElement;
const signupPass = document.getElementById('signup-password') as HTMLInputElement;

const statJitter = document.getElementById('stat-jitter')!;
const statLoss = document.getElementById('stat-loss')!;
const qualitySignal = document.getElementById('quality-signal')!;
const qualityContainer = document.getElementById('quality-indicators')!;

// App State
let currentUser: any = null;
let profile: UserProfile | null = null;
let currentCall: CallSession | null = null;
let callTimerInterval: any = null;
let statsInterval: any = null;
let callStartTime: number = 0;
let dashboardUnsubs: (() => void)[] = [];

// Helper: Get Initials
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Helper: Show Screen
function showScreen(screenId: string) {
  [screenAuth, screenUsername, screenDashboard].forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId)?.classList.remove('hidden');
}

// Helper: Format Timer
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Initial State
onAuth(async (user) => {
  cleanupDashboard();
  currentUser = user;
  
  // Register SW
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      
      // Listen for messages from SW (Auto-answer from notification)
      navigator.serviceWorker.addEventListener('message', async (event) => {
        if (event.data.type === 'NOTIFICATION_CLICKED') {
          const { callId, action } = event.data;
          if (action === 'answer' || !action) {
            const snap = await getDoc(doc(db, 'calls', callId));
            if (snap.exists()) {
              const callerId = snap.data().callerId;
              const callerSnap = await getDoc(doc(db, 'users', callerId));
              showIncomingOverlay(callId, { uid: callerId, ...callerSnap.data() });
              acceptBtn.click();
            }
          }
        }
      });
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  }

  if (!user) {
    showScreen('auth-screen');
    return;
  }

  profile = await getUserProfile(user.uid);
  if (!profile) {
    showScreen('username-screen');
  } else {
    initDashboard();
  }
});

// Auth Handlers
loginBtn.onclick = () => login();

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
  tabLogin.classList.remove('text-slate-500');
  tabSignup.classList.add('text-slate-500');
  tabSignup.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
  loginForm.classList.remove('hidden');
  signupForm.classList.add('hidden');
});

tabSignup.addEventListener('click', () => {
  tabSignup.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
  tabSignup.classList.remove('text-slate-500');
  tabLogin.classList.add('text-slate-500');
  tabLogin.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
  signupForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const btn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    await loginWithEmail(loginEmail.value, loginPass.value);
  } catch (err: any) {
    alert(err.message);
  } finally {
    const btn = loginForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = false;
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const btn = signupForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = true;
    await signupWithEmail(signupEmail.value, signupPass.value, signupName.value);
  } catch (err: any) {
    alert(err.message);
  } finally {
    const btn = signupForm.querySelector('button[type="submit"]') as HTMLButtonElement;
    btn.disabled = false;
  }
});

logoutBtn.onclick = async () => {
  if (currentUser) {
    await setUserStatus(currentUser.uid, 'offline');
  }
  await logout();
};

saveUsernameBtn.onclick = async () => {
  const username = usernameInput.value.trim();
  if (username.length < 3 || username.length > 20) return;
  
  saveUsernameBtn.disabled = true;
  try {
    await createUsername(currentUser.uid, username, currentUser.displayName || username);
    profile = await getUserProfile(currentUser.uid);
    initDashboard();
  } catch (err: any) {
    alert(err.message);
  } finally {
    saveUsernameBtn.disabled = false;
  }
};

function cleanupDashboard() {
  dashboardUnsubs.forEach(unsub => unsub());
  dashboardUnsubs = [];
}

// Dashboard Initialization
async function initDashboard() {
  showScreen('dashboard-screen');
  if (!profile || !currentUser) return;

  cleanupDashboard();

  document.getElementById('user-display-name')!.innerText = profile.displayName;
  document.getElementById('user-username')!.innerText = `@${profile.username}`;
  document.getElementById('user-avatar-placeholder')!.innerText = getInitials(profile.displayName);

  // FCM
  const token = await requestNotificationPermission();
  if (token) await updateFcmToken(currentUser.uid, token);

  // Friends & Requests
  const friendsUnsub = subscribeToFriends(currentUser.uid, (friends) => {
    friendsList.innerHTML = friends.length ? '' : '<p class="text-[10px] text-slate-400 px-2 mt-2 font-medium">Contacts will appear here.</p>';
    friends.forEach(f => {
      const isOnline = f.onlineStatus === 'online';
      const el = document.createElement('div');
      el.className = 'group p-3 rounded-xl hover:bg-white flex items-center justify-between transition-all cursor-pointer animate-fade-in relative hover:shadow-sm border border-transparent hover:border-slate-200';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-500 group-hover:border-blue-500/30 group-hover:text-blue-600 transition-all">${getInitials(f.displayName)}</div>
            <div class="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-50 ${isOnline ? 'bg-ios-green' : 'bg-slate-300'}"></div>
          </div>
          <div class="overflow-hidden">
            <p class="text-xs font-semibold truncate text-slate-900">${f.displayName}</p>
            <p class="text-[9px] text-slate-500 font-mono">@${f.username} ${isOnline ? '• Online' : ''}</p>
          </div>
        </div>
        <button class="call-trigger opacity-0 group-hover:opacity-100 p-2 bg-blue-600/10 text-blue-600 rounded-lg transform hover:scale-110 transition-all">
           <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </button>
      `;
;
      el.querySelector('.call-trigger')?.addEventListener('click', (e) => {
        e.stopPropagation();
        startCall(f);
      });
      friendsList.appendChild(el);
    });
  }, (err) => handleFirestoreError(err, 'subscribeToFriends'));
  dashboardUnsubs.push(friendsUnsub);

  const requestsUnsub = subscribeToRequests(currentUser.uid, (requests) => {
    requestsList.innerHTML = '';
    requestsContainer.classList.toggle('hidden', requests.length === 0);

    requests.forEach(r => {
      const el = document.createElement('div');
      el.className = 'p-3 rounded-xl bg-blue-50 border border-blue-100 flex flex-col gap-3 animate-fade-in mb-2';
      el.innerHTML = `
        <div class="flex items-center gap-2 overflow-hidden">
          <div class="w-6 h-6 rounded-lg bg-blue-600/10 flex items-center justify-center text-[10px] font-bold text-blue-600 shrink-0">${getInitials(r.sender.displayName)}</div>
          <p class="text-xs font-semibold truncate text-slate-800">@${r.sender.username}</p>
        </div>
        <div class="flex gap-1.5">
          <button class="accept-req flex-1 bg-blue-600 text-white py-1.5 rounded-lg text-[10px] font-bold hover:bg-blue-500 transition-colors shadow-sm">Accept</button>
          <button class="reject-req flex-1 bg-white border border-slate-200 text-slate-500 py-1.5 rounded-lg text-[10px] hover:bg-slate-50 transition-colors">Reject</button>
        </div>
      `;
      el.querySelector('.accept-req')?.addEventListener('click', () => acceptFriendRequest(r.id));
      el.querySelector('.reject-req')?.addEventListener('click', () => rejectFriendRequest(r.id));
      requestsList.appendChild(el);
    });
  }, (err) => handleFirestoreError(err, 'subscribeToRequests'));
  dashboardUnsubs.push(requestsUnsub);

  const callsUnsub = listenForCalls(currentUser.uid, (callId, caller: any) => {
    showIncomingOverlay(callId, caller);
  }, (err) => handleFirestoreError(err, 'listenForCalls'));
  dashboardUnsubs.push(callsUnsub);

  const historyUnsub = subscribeToHistory(currentUser.uid, (history) => {
    historyList.innerHTML = history.length ? '' : '<p class="text-[10px] text-slate-400 px-2 mt-2 font-medium">Log is currently empty.</p>';
    history.forEach(log => {
      const isCaller = log.callerId === currentUser.uid;
      const person = isCaller ? log.receiverName : log.callerName;
      const personUsername = isCaller ? log.receiverUsername : log.callerUsername;
      const state = log.state || 'ended';
      
      let statusColor = 'text-slate-400';
      let statusLabel = state;
      
      if (state === 'missed') {
        statusColor = 'text-red-500';
        statusLabel = 'Missed';
      } else if (state === 'declined' || state === 'rejected') {
        statusColor = 'text-amber-500';
        statusLabel = 'Declined';
      } else if (state === 'ended') {
        statusColor = 'text-blue-600';
        statusLabel = 'Completed';
      }

      const el = document.createElement('div');
      el.className = 'flex items-center gap-3 p-2 rounded-xl text-slate-500 hover:bg-white transition-all group border border-transparent hover:border-slate-100 hover:shadow-sm';
      el.innerHTML = `
        <div class="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-mono group-hover:bg-slate-200 transition-colors text-slate-500">${getInitials(person)}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[11px] font-semibold text-slate-800 truncate">${person}</div>
          <div class="text-[9px] flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="${isCaller ? 'text-blue-500 rotate-45' : 'text-green-500 -rotate-135'}"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            <span class="${statusColor} font-bold opacity-80 uppercase tracking-tighter text-[8px]">${statusLabel}</span>
            <span class="opacity-30">•</span>
            <span class="text-slate-400 font-mono">${formatTime(log.duration || 0)}</span>
          </div>
        </div>
        <div class="text-[8px] text-slate-400 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          ${log.timestamp?.toMillis() ? new Date(log.timestamp.toMillis()).toLocaleDateString() : ''}
        </div>
      `;
      historyList.appendChild(el);
    });
  }, (err) => handleFirestoreError(err, 'subscribeToHistory'));
  dashboardUnsubs.push(historyUnsub);
}

// Search Logic
let searchTimeout: any;
searchInput.oninput = () => {
  clearTimeout(searchTimeout);
  const q = searchInput.value.trim();
  if (q.length < 3) {
    searchResults.classList.add('hidden');
    return;
  }

  searchTimeout = setTimeout(async () => {
    const user = await findUserByUsername(q);
    searchResults.innerHTML = '';
    searchResults.classList.remove('hidden');

    if (user) {
      if (user.uid === currentUser.uid) return;
      const userAny = user as any;
      const el = document.createElement('div');
      el.className = 'glass-card p-4 rounded-2xl flex items-center justify-between border border-slate-200 shadow-xl bg-white mb-2';
      el.innerHTML = `
        <p class="font-medium text-slate-900">${userAny.displayName} (@${userAny.username})</p>
        <button id="add-friend-btn" class="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-colors">Add</button>
      `;
      el.querySelector('#add-friend-btn')?.addEventListener('click', async () => {
        await sendFriendRequest(currentUser.uid, user.uid);
        searchInput.value = '';
        searchResults.classList.add('hidden');
      });
      searchResults.appendChild(el);
    } else {
      searchResults.innerHTML = '<p class="text-slate-400 text-center py-2 text-sm">No user found</p>';
    }
  }, 500);
};

// Calling Logic
async function startCall(target: any) {
  if (!currentUser) return;
  currentCall = new CallSession();
  
  try {
    const callerAny = target as any;
    activeCallerName.innerText = callerAny.displayName;
    document.querySelectorAll('.caller-avatar').forEach(el => (el as HTMLElement).innerText = getInitials(callerAny.displayName));
    callStatus.innerText = 'Calling...';
    overlayActive.classList.remove('hidden');
    waitingAudio.play();

    const callId = await currentCall.createCall(currentUser.uid, target.uid);
    monitorCall(callId, target.displayName);
  } catch (err: any) {
    alert(err.message === 'NOT_FRIENDS' ? 'You must be friends to call.' : err.message);
    stopCall();
  }
}

function showIncomingOverlay(callId: string, caller: any) {
  incCallerName.innerText = caller.displayName;
  (document.getElementById('inc-caller-username') as HTMLElement).innerText = `@${caller.username}`;
  (document.getElementById('inc-avatar') as HTMLElement).innerText = getInitials(caller.displayName);
  overlayIncoming.classList.remove('hidden');
  ringtoneAudio.play();

  // Decline Handler
  declineBtn.onclick = async () => {
    await currentCall?.logHistory('declined');
    await updateDoc(doc(db, 'calls', callId), { state: 'declined', updatedAt: serverTimestamp() });
    stopCall();
  };

  // Accept Handler
  acceptBtn.onclick = async () => {
    overlayIncoming.classList.add('hidden');
    overlayActive.classList.remove('hidden');
    activeCallerName.innerText = caller.displayName;
    callStatus.innerText = 'Connecting...';
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;

    currentCall = new CallSession();
    await currentCall.answerCall(callId, currentUser.uid);
    monitorCall(callId, caller.displayName);
  };

  // Auto-timeout for missed call (30s)
  setTimeout(async () => {
    const snap = await getDoc(doc(db, 'calls', callId));
    if (snap.exists() && snap.data().state === 'ringing') {
       if (currentCall) await currentCall.logHistory('missed');
       await updateDoc(doc(db, 'calls', callId), { state: 'missed', updatedAt: serverTimestamp() });
       stopCall();
    }
  }, 30000);
}

function monitorCall(callId: string, callerName: string) {
  const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    
    if (data.state === 'connected') {
      waitingAudio.pause();
      waitingAudio.currentTime = 0;
      callStatus.innerText = 'Connected';
      if (!callTimerInterval) startTimer();
      qualityContainer.classList.remove('hidden');
      
      if (!statsInterval) {
        statsInterval = setInterval(async () => {
          if (!currentCall) return;
          const stats = await currentCall.getQualityStats();
          statJitter.innerText = `${stats.jitter}ms`;
          statLoss.innerText = `${stats.packetLoss}%`;
          
          // Update signal bars
          const bars = qualitySignal.querySelectorAll('div');
          let quality = 3; // high
          if (stats.jitter > 100 || stats.packetLoss > 5) quality = 1;
          else if (stats.jitter > 50 || stats.packetLoss > 2) quality = 2;
          
          bars.forEach((bar, i) => {
            if (i < quality) bar.classList.remove('opacity-20');
            else bar.classList.add('opacity-20');
          });
        }, 2000);
      }
      
      // ICE candidates logic
      onSnapshot(collection(db, 'calls', callId, 'candidates'), (cSnap) => {
        cSnap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const cData = change.doc.data();
            if (cData.senderId !== currentUser.uid) {
              currentCall?.pc.addIceCandidate(new RTCIceCandidate(cData.candidate));
            }
          }
        });
      });

      // Handle Answer if caller
      if (data.answer && currentCall?.pc.signalingState !== 'stable') {
        currentCall?.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    }

    if (['ended', 'declined', 'missed'].includes(data.state)) {
      unsub();
      stopCall();
    }
  });

  hangupBtn.onclick = () => currentCall?.hangup();
}

function stopCall() {
  overlayIncoming.classList.add('hidden');
  overlayActive.classList.add('hidden');
  qualityContainer.classList.add('hidden');
  ringtoneAudio.pause();
  ringtoneAudio.currentTime = 0;
  waitingAudio.pause();
  waitingAudio.currentTime = 0;
  
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
  callTimer.innerText = '00:00';
  
  currentCall?.cleanup();
  currentCall = null;
}

function startTimer() {
  callStartTime = Date.now();
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    callTimer.innerText = formatTime(elapsed);
  }, 1000);
}

// Sidebar Toggle
sidebarToggle?.addEventListener('click', () => {
  sidebar.classList.toggle('-translate-x-full');
});

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (
    !sidebar.classList.contains('-translate-x-full') && 
    !sidebar.contains(target) && 
    !sidebarToggle.contains(target) &&
    window.innerWidth < 768
  ) {
    sidebar.classList.add('-translate-x-full');
  }
});

// Mute Toggle
muteBtn?.addEventListener('click', () => {
  if (currentCall) {
    const isMuted = currentCall.toggleMute();
    muteLabel.innerText = isMuted ? 'Muted' : 'Mute';
    muteIcon.classList.toggle('text-red-500', isMuted);
    muteIcon.classList.toggle('text-slate-600', !isMuted);
    muteIcon.classList.toggle('text-slate-400', !isMuted);
  }
});

// Handle Page Navigation for Service Worker
const urlParams = new URLSearchParams(window.location.search);
const callId = urlParams.get('callId');
const action = urlParams.get('action');

if (callId && action === 'answer') {
  // Logic to simulate accept click if logged in
  console.log('Deep link answer triggered', callId);
}
