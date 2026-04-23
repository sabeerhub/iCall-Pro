# iCall Pro: High-Fidelity Audio Communication Suite

iCall Pro is an enterprise-grade WebRTC audio communication platform engineered for high-performance team collaboration. Combining a minimalist, light-themed aesthetic with advanced peer-to-peer engineering, it offers a secure and seamless calling experience with integrated real-time quality analytics and intelligent presence management.

---

## 🎨 Minimalism Meets Performance

iCall Pro features a refined **Light Mode** interface designed for clarity and focus:
- **Liquid Light UI**: A bright, professional aesthetic using a clean slate-on-white palette.
- **Glassmorphic Overlays**: Sophisticated use of backdrop filters and subtle shadows to create depth without visual noise.
- **Micro-Animations**: Staggered entry animations and smooth state transitions provide a premium, tactile feel.
- **Technical Typography**: A thoughtful pairing of high-contrast sans-serif for UI and monospace for technical telemetry (stats, timers).

---

## 🚀 Core Features

### 📡 High-End Connectivity
- **Peer-to-Peer Engine**: Pure WebRTC implementation with automatic ICE candidate negotiation for ultra-low latency.
- **Active Call Telemetry**: Real-time monitoring of **Jitter**, **Packet Loss**, and **Signal Integrity** directly within the call interface.
- **Smart Signaling**: A robust state machine powered by Firestore that handles network handovers and reconnections gracefully.

### 👤 Identity & Presence
- **Global Identity Registry**: Integrated username claim system with guaranteed uniqueness and real-time validation.
- **Live Presence Engine**: Reactive "Online/Offline" status indicators synced across the network with millisecond precision.
- **Secure Social Graph**: A bidirectional, opt-in friendship model that serves as the foundation for secure signaling.

### 📊 Intelligence & History
- **Universal Lookup**: High-speed search interface with real-time result filtering.
- **Detailed Audit Logs**: Categorized history (Completed, Missed, Declined, Rejected) featuring participant indexing and precise duration tracking.
- **Persistent Signal**: Service-worker-integrated background notifications for incoming calls and connection requests.

---

## 🛠 Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Logic** | TypeScript (ES Modules) |
| **Architecture** | Functional Module Pattern |
| **Data Engine** | Cloud Firestore + Real-time Listeners |
| **Identity** | Firebase Authentication (OAuth & Email/Password) |
| **Protocols** | WebRTC (RTCPeerConnection + SDP Signaling) |
| **Visuals** | Tailwind CSS (JIT Mode) |
| **Infrastructure** | FCM + Service Workers |

---

## 🏗 Modular Architecture

iCall Pro is built on a decoupled, modular foundation:

- **`src/calls.ts`**: The WebRTC coordinator. Orchestrates `RTCPeerConnection` lifecycles, gathering of stream telemetry, and signal synchronization.
- **`src/auth.ts`**: The Identity service. Manages authentication sessions, profile persistence, and presence heartbeats.
- **`src/friends.ts`**: The Social orchestrator. Manages complex bidirectional graph relationships and friend request pipelines.
- **`src/db.ts`**: The Infrastructure layer. Centralizes persistent connections and implements health-checking for the real-time database.
- **`src/main.ts`**: The View controller. Manages presentation states, global event dispatching, and observer lifecycle management.

---

## 🛡 Security First

The platform operates on a **Defensive Security** model enforced via strict Firestore rules:
1. **Relational Constraints**: Signaling channels are exclusively established between verified friends.
2. **Identity Verification**: Real-time verification of `resource.data.ownerId` against authenticated session tokens.
3. **Immutability Enforcement**: Core transaction fields (timestamps, participant IDs) are protected after initial creation.
4. **Presence Integrity**: Strict enforcement ensuring users can only broadcast their *own* status updates.

---

## ⏱ Developer setup

### 1. Requirements
- Node.js 18+
- Firebase project with Firestore and Auth configured.

### 2. Configuration
Deploy a `firebase-applet-config.json` in the project root:
```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT_ID.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT_ID.appspot.com",
  "messagingSenderId": "YOUR_SENDER_ID",
  "appId": "YOUR_APP_ID"
}
```

### 3. Execution commands
```bash
# Initialize packages
npm install

# Start development server
npm run dev

# Generate production build
npm run build
```

---

**Crafted for excellence by Antigravity and Gemini.**
