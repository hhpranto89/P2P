/**
 * Nexus P2P Messenger - Serverless WebRTC Signaling & Peer Connection via Gun.js
 */
import Gun from 'gun/gun';

const PUBLIC_RELAY_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://peer.wallie.io/gun',
  'https://gundb-relay-mlit.onrender.com/gun'
];

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

export class P2PNetworkService {
  constructor() {
    this.gun = null;
    this.myPeerId = this.getOrCreatePeerId();
    this.peerConnection = null;
    this.dataChannel = null;
    this.remotePeerId = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isInitiator = false;
    this.processedSignals = new Set();
    this.pendingCandidates = [];

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

    this.initGun();
    this.initBroadcastFallback();
  }

  getOrCreatePeerId() {
    let id = localStorage.getItem('nexus_peer_id');
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 8);
      id = `nexus-${rand}`;
      localStorage.setItem('nexus_peer_id', id);
    }
    return id;
  }

  getMyPeerId() {
    return this.myPeerId;
  }

  setPeerId(newId) {
    if (!newId || newId.trim() === '') return;
    this.myPeerId = newId.trim().toLowerCase();
    localStorage.setItem('nexus_peer_id', this.myPeerId);
    this.initGun();
  }

  initGun() {
    try {
      this.gun = Gun({
        peers: PUBLIC_RELAY_PEERS,
        localStorage: true,
        radisk: true,
      });

      // Listen on my mailbox channel
      const mySignalNode = this.gun.get('nexus_p2p_signals_v2').get(this.myPeerId);
      
      mySignalNode.map().on((data, key) => {
        if (!data || typeof data !== 'object') return;
        this.handleIncomingSignal(data, key);
      });
    } catch (err) {
      console.error('[GunSignaling] Failed to initialize Gun:', err);
    }
  }

  /**
   * BroadcastChannel fallback for instant zero-latency signaling when testing
   * across multiple tabs or windows on the same machine.
   */
  initBroadcastFallback() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.bc = new BroadcastChannel('nexus_p2p_local_mesh');
        this.bc.onmessage = (event) => {
          const { targetPeerId, signal, key } = event.data || {};
          if (targetPeerId === this.myPeerId && signal) {
            this.handleIncomingSignal(signal, key || `bc-${Date.now()}`);
          }
        };
      } catch (err) {
        console.warn('[BroadcastChannel] not supported or error:', err);
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
   * Post a signal message to a target peer's Gun mailbox
   */
  sendSignal(targetPeerId, signalPayload) {
    const enrichedSignal = {
      ...signalPayload,
      from: this.myPeerId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2, 9),
    };

    // 1. Post via Gun.js
    if (this.gun) {
      const signalKey = `sig_${Date.now()}_${enrichedSignal.nonce}`;
      this.gun
        .get('nexus_p2p_signals_v2')
        .get(targetPeerId)
        .get(signalKey)
        .put(enrichedSignal);
    }

    // 2. Broadcast via local channel (if tabs on same origin)
    if (this.bc) {
      this.bc.postMessage({
        targetPeerId,
        signal: enrichedSignal,
        key: `bc_${Date.now()}_${enrichedSignal.nonce}`,
      });
    }
  }

  /**
   * Process incoming WebRTC signaling data
   */
  async handleIncomingSignal(signal, key) {
    if (!signal || !signal.from || signal.from === this.myPeerId) return;

    // Deduplicate
    const signalId = key || `${signal.from}_${signal.timestamp}_${signal.type}_${signal.nonce}`;
    if (this.processedSignals.has(signalId)) return;
    this.processedSignals.add(signalId);

    // Filter out obsolete signals older than 3 minutes
    if (signal.timestamp && Date.now() - signal.timestamp > 180000) return;

    const { from, type, data } = signal;

    switch (type) {
      case 'offer':
        await this.handleOffer(from, data);
        break;
      case 'answer':
        await this.handleAnswer(data);
        break;
      case 'candidate':
        await this.handleCandidate(data);
        break;
      case 'call-invite':
        this.emit('onIncomingCall', {
          callerId: from,
          callerName: signal.callerName || from,
          isVideo: !!signal.isVideo,
          timestamp: signal.timestamp,
        });
        break;
      case 'call-accept':
        this.emit('onCallAccepted', { from, isVideo: !!signal.isVideo });
        break;
      case 'call-reject':
        this.emit('onCallRejected', { from });
        break;
      case 'call-end':
        this.emit('onCallEnded', { from });
        this.cleanupCallMedia();
        break;
      default:
        break;
    }
  }

  /**
   * Initialize a new RTCPeerConnection
   */
  createPeerConnection(remotePeerId) {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
    }

    this.remotePeerId = remotePeerId;
    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.remotePeerId) {
        this.sendSignal(this.remotePeerId, {
          type: 'candidate',
          data: JSON.stringify(event.candidate),
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      this.emit('onConnectionStateChange', state, this.remotePeerId);
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection.iceConnectionState;
      this.emit('onIceStateChange', iceState);
    };

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.emit('onRemoteStream', this.remoteStream);
      }
    };

    return this.peerConnection;
  }

  /**
   * Setup DataChannel listeners
   */
  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.emit('onConnectionStateChange', 'connected', this.remotePeerId);
    };

    this.dataChannel.onclose = () => {
      this.emit('onConnectionStateChange', 'disconnected', this.remotePeerId);
    };

    this.dataChannel.onerror = (err) => {
      console.error('[DataChannel] Error:', err);
    };

    this.dataChannel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data);
    };
  }

  /**
   * Handle incoming DataChannel packet
   */
  handleDataChannelMessage(data) {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'file-meta') {
          this.emit('onFileMeta', parsed);
        } else if (parsed.type === 'chat') {
          this.emit('onMessage', parsed);
        } else if (parsed.type === 'file-chunk') {
          this.emit('onFileChunk', parsed);
        } else {
          this.emit('onMessage', parsed);
        }
      } catch (err) {
        this.emit('onMessage', { type: 'chat', text: data, from: this.remotePeerId });
      }
    } else if (data instanceof ArrayBuffer) {
      // Direct raw binary chunk
      this.emit('onFileChunk', { isBinary: true, buffer: data });
    }
  }

  /**
   * Connect to a remote peer (Initiator)
   */
  async connectToPeer(targetPeerId) {
    if (!targetPeerId) return;
    this.remotePeerId = targetPeerId;
    this.isInitiator = true;

    const pc = this.createPeerConnection(targetPeerId);

    // Create reliable ordered DataChannel for chat & file chunking
    const dc = pc.createDataChannel('nexus_p2p_channel', {
      ordered: true,
    });
    this.setupDataChannel(dc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(targetPeerId, {
        type: 'offer',
        data: JSON.stringify(offer),
      });

      this.emit('onConnectionStateChange', 'connecting', targetPeerId);
    } catch (err) {
      console.error('[P2P] Failed to create offer:', err);
      this.emit('onConnectionStateChange', 'failed', targetPeerId);
    }
  }

  /**
   * Handle incoming Offer (Receiver)
   */
  async handleOffer(fromPeerId, sdpStr) {
    this.remotePeerId = fromPeerId;
    this.isInitiator = false;

    const pc = this.createPeerConnection(fromPeerId);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    try {
      const offer = JSON.parse(sdpStr);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush queued candidates
      while (this.pendingCandidates.length > 0) {
        const cand = this.pendingCandidates.shift();
        await pc.addIceCandidate(cand).catch(e => console.warn(e));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.sendSignal(fromPeerId, {
        type: 'answer',
        data: JSON.stringify(answer),
      });
    } catch (err) {
      console.error('[P2P] Error handling offer:', err);
    }
  }

  /**
   * Handle incoming Answer (Initiator)
   */
  async handleAnswer(sdpStr) {
    if (!this.peerConnection) return;
    try {
      const answer = JSON.parse(sdpStr);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      while (this.pendingCandidates.length > 0) {
        const cand = this.pendingCandidates.shift();
        await this.peerConnection.addIceCandidate(cand).catch(e => console.warn(e));
      }
    } catch (err) {
      console.error('[P2P] Error handling answer:', err);
    }
  }

  /**
   * Handle ICE Candidate
   */
  async handleCandidate(candidateStr) {
    try {
      const candidateObj = JSON.parse(candidateStr);
      const candidate = new RTCIceCandidate(candidateObj);

      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(candidate);
      } else {
        this.pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.error('[P2P] Error adding candidate:', err);
    }
  }

  /**
   * Send JSON chat or control message over DataChannel
   */
  sendChatMessage(messageText) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }

    const payload = {
      type: 'chat',
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      text: messageText,
      sender: this.myPeerId,
      timestamp: Date.now(),
    };

    this.dataChannel.send(JSON.stringify(payload));
    return payload;
  }

  /**
   * Send arbitrary JSON payload over DataChannel
   */
  sendData(payload) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }
    this.dataChannel.send(JSON.stringify(payload));
    return true;
  }

  /**
   * Send binary chunk with backpressure handling
   */
  async sendChunkWithBackpressure(chunkPayload) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('Data channel not open');
    }

    const BUFFER_LIMIT = 65536 * 4; // 256KB threshold

    if (this.dataChannel.bufferedAmount > BUFFER_LIMIT) {
      await new Promise((resolve) => {
        const onBufferedAmountLow = () => {
          this.dataChannel.removeEventListener('bufferedamountlow', onBufferedAmountLow);
          resolve();
        };
        this.dataChannel.bufferedAmountLowThreshold = 65536;
        this.dataChannel.addEventListener('bufferedamountlow', onBufferedAmountLow);
      });
    }

    this.dataChannel.send(JSON.stringify(chunkPayload));
  }

  /**
   * Call Signaling & Media Track Management
   */
  async initiateCall({ isVideo = false }) {
    if (!this.remotePeerId) {
      throw new Error('No peer connected to call');
    }

    // Acquire user media
    const constraints = {
      audio: true,
      video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Ensure peerConnection is ready
    if (!this.peerConnection) {
      this.createPeerConnection(this.remotePeerId);
    }

    // Attach local audio/video tracks to peer connection
    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Notify peer of incoming call
    this.sendSignal(this.remotePeerId, {
      type: 'call-invite',
      callerName: this.myPeerId,
      isVideo,
    });

    return this.localStream;
  }

  async acceptCall({ isVideo = false }) {
    if (!this.remotePeerId) return null;

    const constraints = {
      audio: true,
      video: isVideo ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (!this.peerConnection) {
      this.createPeerConnection(this.remotePeerId);
    }

    this.localStream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    // Renegotiate offer/answer with media tracks
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.sendSignal(this.remotePeerId, {
      type: 'offer',
      data: JSON.stringify(offer),
    });

    this.sendSignal(this.remotePeerId, {
      type: 'call-accept',
      isVideo,
    });

    return this.localStream;
  }

  rejectCall() {
    if (this.remotePeerId) {
      this.sendSignal(this.remotePeerId, {
        type: 'call-reject',
      });
    }
  }

  endCall() {
    if (this.remotePeerId) {
      this.sendSignal(this.remotePeerId, {
        type: 'call-end',
      });
    }
    this.cleanupCallMedia();
  }

  cleanupCallMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
  }
}

// Singleton export
export const p2pService = new P2PNetworkService();
export default p2pService;
