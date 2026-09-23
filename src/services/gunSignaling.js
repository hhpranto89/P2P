/**
 * Nexus P2P Messenger - Robust WebRTC Signaling & Mesh via PeerJS
 * Uses official public PeerServer (0.peerjs.com) with Google STUN + Metered TURN servers.
 * Designed for serverless static hosts (Netlify, Vercel, PWA) and mobile data/NAT.
 */
import peerjsPkg from 'peerjs';

const Peer = peerjsPkg.Peer || peerjsPkg.default?.Peer || peerjsPkg.default || peerjsPkg;

// High-reliability STUN & TURN servers for cross-network connectivity (Cellular 4G/5G, NAT traversal)
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Open Relay Project (Free public TURN servers by Metered.ca - UDP & TCP 443)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class P2PNetworkService {
  constructor() {
    this.peer = null;
    this.myPeerId = this.getOrCreatePeerId();
    this.remotePeerId = null;
    this.activeConnection = null;
    this.activeMediaCall = null;
    this.incomingMediaCall = null;
    this.localStream = null;
    this.remoteStream = null;

    this.isServerConnected = false;
    this.pendingConnectTarget = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.pingInterval = null;

    // Registered Event Handlers
    this.handlers = {
      onConnectionStateChange: () => {},
      onMessage: () => {},
      onFileMeta: () => {},
      onFileChunk: () => {},
      onIncomingCall: () => {},
      onCallAccepted: () => {},
      onCallRejected: () => {},
      onCallEnded: () => {},
      onRemoteStream: () => {},
      onIceStateChange: () => {},
    };

    this.initPeer();
    this.initBroadcastFallback();

    // Cleanly destroy peer on window unload to immediately release Peer ID on signaling server
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (this.peer && !this.peer.destroyed) {
          try {
            this.peer.destroy();
          } catch (e) {}
        }
      });
    }
  }

  getOrCreatePeerId() {
    let id = localStorage.getItem('nexus_peer_id');
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 8);
      id = `nexus-${rand}`;
      localStorage.setItem('nexus_peer_id', id);
    }
    return id.trim().toLowerCase();
  }

  getMyPeerId() {
    return this.myPeerId;
  }

  setPeerId(newId) {
    if (!newId || newId.trim() === '') return;
    const cleanId = newId.trim().toLowerCase();
    if (cleanId === this.myPeerId) return;

    this.myPeerId = cleanId;
    localStorage.setItem('nexus_peer_id', this.myPeerId);
    this.initPeer();
  }

  /**
   * Initialize PeerJS connection with 0.peerjs.com signaling
   */
  initPeer() {
    // Teardown previous instance if any
    if (this.peer && !this.peer.destroyed) {
      try {
        this.peer.destroy();
      } catch (e) {}
    }
    this.isServerConnected = false;

    try {
      this.peer = new Peer(this.myPeerId, {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        pingInterval: 5000,
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,
        },
      });

      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.isServerConnected = true;
        console.log('[P2P] Registered with signaling server as:', id);

        // If there was a pending connection attempt waiting for signaling server:
        if (this.pendingConnectTarget) {
          const target = this.pendingConnectTarget;
          this.pendingConnectTarget = null;
          this.connectToPeer(target);
        }
      });

      // Handle incoming Data Connection (Receiver)
      this.peer.on('connection', (conn) => {
        console.log('[P2P] Incoming connection from:', conn.peer);
        this.handleIncomingConnection(conn);
      });

      // Handle incoming Media Call (Audio/Video)
      this.peer.on('call', (mediaCall) => {
        console.log('[P2P] Incoming call from:', mediaCall.peer);
        this.incomingMediaCall = mediaCall;
        const isVideo = !!mediaCall.metadata?.isVideo;

        this.emit('onIncomingCall', {
          callerId: mediaCall.peer,
          callerName: mediaCall.metadata?.callerId || mediaCall.peer,
          isVideo,
          timestamp: Date.now(),
        });
      });

      this.peer.on('disconnected', () => {
        console.warn('[P2P] Disconnected from signaling server. Reconnecting...');
        this.isServerConnected = false;
        if (this.peer && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      });

      this.peer.on('close', () => {
        this.isServerConnected = false;
      });

      this.peer.on('error', (err) => {
        console.warn('[P2P] Peer error:', err.type, err.message);

        if (err.type === 'peer-unavailable') {
          // Remote peer is not yet connected to the signaling server (e.g. hasn't opened app yet)
          this.emit('onConnectionStateChange', 'connecting', this.remotePeerId);
          this.scheduleAutoRetry();
        } else if (err.type === 'unavailable-id') {
          // Peer ID is currently occupied (e.g. rapid page refresh)
          console.warn('[P2P] ID unavailable, retrying in 2 seconds...');
          setTimeout(() => {
            if (this.peer && this.peer.destroyed) {
              this.initPeer();
            }
          }, 2000);
        } else if (err.type === 'network' || err.type === 'server-error') {
          if (this.peer && !this.peer.destroyed) {
            setTimeout(() => this.peer.reconnect(), 3000);
          }
        }
      });
    } catch (err) {
      console.error('[P2P] Failed to initialize Peer:', err);
    }
  }

  /**
   * BroadcastChannel for instant testing across multiple tabs on same browser
   */
  initBroadcastFallback() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.bc = new BroadcastChannel('nexus_p2p_local_mesh');
        this.bc.onmessage = (event) => {
          const { targetPeerId, type, payload } = event.data || {};
          if (targetPeerId === this.myPeerId) {
            if (type === 'data') {
              this.handleIncomingData(payload);
            } else if (type === 'ping') {
              this.emit('onConnectionStateChange', 'connected', payload?.from);
            }
          }
        };
      } catch (err) {
        console.warn('[BroadcastChannel] error:', err);
      }
    }
  }

  on(event, callback) {
    if (this.handlers[event] !== undefined) {
      this.handlers[event] = callback;
    }
  }

  emit(event, ...args) {
    if (typeof this.handlers[event] === 'function') {
      this.handlers[event](...args);
    }
  }

  /**
   * Connect to a remote peer via WebRTC DataConnection
   */
  connectToPeer(targetPeerId) {
    if (!targetPeerId) return;
    const cleanId = targetPeerId.trim().toLowerCase();
    if (cleanId === this.myPeerId) return;

    this.remotePeerId = cleanId;

    // Check if already connected to this peer
    if (
      this.activeConnection &&
      this.activeConnection.peer.toLowerCase() === cleanId &&
      this.activeConnection.open
    ) {
      this.emit('onConnectionStateChange', 'connected', cleanId);
      return;
    }

    this.emit('onConnectionStateChange', 'connecting', cleanId);

    // If signaling server is not yet ready, queue the attempt
    if (!this.peer || !this.isServerConnected || this.peer.destroyed) {
      this.pendingConnectTarget = cleanId;
      return;
    }

    // Clean up previous connection if any
    if (this.activeConnection) {
      try {
        this.activeConnection.close();
      } catch (e) {}
      this.activeConnection = null;
    }

    try {
      const conn = this.peer.connect(cleanId, {
        reliable: true,
      });

      this.setupConnectionListeners(conn);
    } catch (err) {
      console.error('[P2P] Failed to initiate connection:', err);
      this.scheduleAutoRetry();
    }
  }

  /**
   * Automatically retry connecting if the remote peer is not yet online
   */
  scheduleAutoRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (!this.remotePeerId) return;

    // Retry every 4 seconds up to 15 times
    if (this.retryCount < 15) {
      this.retryCount += 1;
      this.retryTimer = setTimeout(() => {
        if (
          this.remotePeerId &&
          (!this.activeConnection || !this.activeConnection.open)
        ) {
          console.log(`[P2P] Auto-retrying connection to ${this.remotePeerId} (attempt ${this.retryCount})...`);
          this.connectToPeer(this.remotePeerId);
        }
      }, 4000);
    }
  }

  manualRetry() {
    this.retryCount = 0;
    if (this.remotePeerId) {
      this.connectToPeer(this.remotePeerId);
    }
  }

  /**
   * Setup listeners for an active DataConnection
   */
  setupConnectionListeners(conn) {
    conn.on('open', () => {
      console.log('[P2P] Data connection opened with:', conn.peer);
      this.activeConnection = conn;
      this.remotePeerId = conn.peer.toLowerCase();
      this.retryCount = 0;
      if (this.retryTimer) clearTimeout(this.retryTimer);

      this.emit('onConnectionStateChange', 'connected', this.remotePeerId);
      this.startHeartbeat();

      // Broadcast locally as well for same-device tabs
      if (this.bc) {
        this.bc.postMessage({
          targetPeerId: this.remotePeerId,
          type: 'ping',
          payload: { from: this.myPeerId },
        });
      }
    });

    conn.on('data', (data) => {
      this.handleIncomingData(data);
    });

    conn.on('close', () => {
      console.log('[P2P] Data connection closed with:', conn.peer);
      if (this.activeConnection === conn) {
        this.activeConnection = null;
        this.stopHeartbeat();
        this.emit('onConnectionStateChange', 'disconnected', conn.peer);
      }
    });

    conn.on('error', (err) => {
      console.warn('[P2P] Connection error with:', conn.peer, err);
      this.scheduleAutoRetry();
    });

    // Monitor underlying RTCPeerConnection ICE state
    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        const ice = conn.peerConnection.iceConnectionState;
        this.emit('onIceStateChange', ice);
      };
    }
  }

  /**
   * Handle incoming connection from remote peer
   */
  handleIncomingConnection(conn) {
    const incomingPeerId = conn.peer.toLowerCase();

    // If we already have an open connection with this peer, accept it or reuse
    if (this.activeConnection && this.activeConnection.open && this.activeConnection.peer.toLowerCase() === incomingPeerId) {
      conn.close();
      return;
    }

    this.remotePeerId = incomingPeerId;
    this.setupConnectionListeners(conn);
  }

  /**
   * Heartbeat to keep NAT pinhole open indefinitely
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.activeConnection && this.activeConnection.open) {
        try {
          this.activeConnection.send({ type: '__ping__', timestamp: Date.now() });
        } catch (e) {}
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Process incoming messages and file chunks
   */
  handleIncomingData(data) {
    if (!data) return;

    let payload = data;
    if (typeof data === 'string') {
      try {
        payload = JSON.parse(data);
      } catch (e) {
        payload = { type: 'chat', text: data, sender: this.remotePeerId };
      }
    }

    if (payload.type === '__ping__') {
      if (this.activeConnection && this.activeConnection.open) {
        try {
          this.activeConnection.send({ type: '__pong__', timestamp: Date.now() });
        } catch (e) {}
      }
      return;
    }
    if (payload.type === '__pong__') {
      return;
    }

    if (payload.type === 'file-meta') {
      this.emit('onFileMeta', payload);
    } else if (payload.type === 'chat') {
      this.emit('onMessage', payload);
    } else if (payload.type === 'file-chunk') {
      this.emit('onFileChunk', payload);
    } else {
      this.emit('onMessage', payload);
    }
  }

  /**
   * Send JSON chat message
   */
  sendChatMessage(messageText) {
    const payload = {
      type: 'chat',
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: messageText,
      sender: this.myPeerId,
      timestamp: Date.now(),
    };

    let sent = false;
    if (this.activeConnection && this.activeConnection.open) {
      this.activeConnection.send(payload);
      sent = true;
    }

    // Also dispatch to local broadcast channel
    if (this.bc && this.remotePeerId) {
      this.bc.postMessage({
        targetPeerId: this.remotePeerId,
        type: 'data',
        payload,
      });
      sent = true;
    }

    return sent ? payload : null;
  }

  /**
   * Send arbitrary JSON payload (e.g. file metadata)
   */
  sendData(payload) {
    let sent = false;
    if (this.activeConnection && this.activeConnection.open) {
      this.activeConnection.send(payload);
      sent = true;
    }

    if (this.bc && this.remotePeerId) {
      this.bc.postMessage({
        targetPeerId: this.remotePeerId,
        type: 'data',
        payload,
      });
      sent = true;
    }

    return sent;
  }

  /**
   * Send binary/chunk data with backpressure control
   */
  async sendChunkWithBackpressure(chunkPayload) {
    if (!this.activeConnection || !this.activeConnection.open) {
      // If broadcast channel available for local test
      if (this.bc && this.remotePeerId) {
        this.bc.postMessage({
          targetPeerId: this.remotePeerId,
          type: 'data',
          payload: chunkPayload,
        });
        return;
      }
      throw new Error('P2P connection not open');
    }

    const dataChannel = this.activeConnection.dataChannel;
    const BUFFER_LIMIT = 262144; // 256KB threshold

    if (dataChannel && dataChannel.bufferedAmount > BUFFER_LIMIT) {
      await new Promise((resolve) => {
        const onBufferedLow = () => {
          dataChannel.removeEventListener('bufferedamountlow', onBufferedLow);
          resolve();
        };
        dataChannel.bufferedAmountLowThreshold = 65536;
        dataChannel.addEventListener('bufferedamountlow', onBufferedLow);
      });
    }

    this.activeConnection.send(chunkPayload);
  }

  /**
   * Media Calling: Initiate Audio/Video Call
   */
  async initiateCall({ isVideo = false }) {
    if (!this.remotePeerId) {
      throw new Error('No remote peer specified for call');
    }

    const constraints = {
      audio: true,
      video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    const call = this.peer.call(this.remotePeerId, this.localStream, {
      metadata: { isVideo, callerId: this.myPeerId },
    });

    this.activeMediaCall = call;
    this.setupCallListeners(call);

    return this.localStream;
  }

  /**
   * Media Calling: Accept Incoming Call
   */
  async acceptCall({ isVideo = false }) {
    if (!this.incomingMediaCall) return null;

    const constraints = {
      audio: true,
      video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    this.incomingMediaCall.answer(this.localStream);
    this.activeMediaCall = this.incomingMediaCall;
    this.incomingMediaCall = null;

    this.setupCallListeners(this.activeMediaCall);
    this.emit('onCallAccepted', { from: this.remotePeerId, isVideo });

    return this.localStream;
  }

  setupCallListeners(call) {
    call.on('stream', (stream) => {
      this.remoteStream = stream;
      this.emit('onRemoteStream', stream);
      this.emit('onCallAccepted', { from: call.peer });
    });

    call.on('close', () => {
      this.emit('onCallEnded', { from: call.peer });
      this.cleanupCallMedia();
    });

    call.on('error', (err) => {
      console.warn('[P2P] Media call error:', err);
      this.emit('onCallEnded', { from: call.peer });
      this.cleanupCallMedia();
    });
  }

  rejectCall() {
    if (this.incomingMediaCall) {
      try {
        this.incomingMediaCall.close();
      } catch (e) {}
      this.incomingMediaCall = null;
    }
  }

  endCall() {
    if (this.activeMediaCall) {
      try {
        this.activeMediaCall.close();
      } catch (e) {}
      this.activeMediaCall = null;
    }
    if (this.incomingMediaCall) {
      try {
        this.incomingMediaCall.close();
      } catch (e) {}
      this.incomingMediaCall = null;
    }
    this.cleanupCallMedia();
  }

  cleanupCallMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
  }
}

// Singleton export
export const p2pService = new P2PNetworkService();
export default p2pService;
