import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, X, AlertCircle } from 'lucide-react';
import p2pService from './services/gunSignaling';
import contactService from './services/contactService';
import ContactsScreen from './components/ContactsScreen';
import ChatScreen from './components/ChatScreen';
import CallScreen from './components/CallScreen';
import SettingsModal from './components/SettingsModal';
import { useScreenMetrics } from './hooks/useScreenMetrics';

export default function App() {
  const [myPeerId, setMyPeerId] = useState(p2pService.getMyPeerId());
  const [currentScreen, setCurrentScreen] = useState('contacts'); // 'contacts' (Screen 1) | 'chat' (Screen 2)
  const [activeContact, setActiveContact] = useState(null); // { peerId, name }
  const [remotePeerId, setRemotePeerId] = useState('');
  const [contacts, setContacts] = useState([]);
  const [connectionState, setConnectionState] = useState('new'); // 'new' | 'connecting' | 'connected' | 'disconnected'
  const [iceState, setIceState] = useState('');

  // Call states
  const [callState, setCallState] = useState('idle'); // 'idle' | 'calling' | 'incoming' | 'connected'
  const [callInfo, setCallInfo] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  // Modals & UI states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = useCallback((msg, duration = 3000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, duration);
  }, []);

  // Screen metrics hook measuring live viewport, safe area, DPR in the background
  const metrics = useScreenMetrics();
  const { simulationPreset, setSimulationPreset } = metrics;

  // Load saved contacts for this identity
  const refreshContacts = useCallback(() => {
    if (myPeerId) {
      const list = contactService.getContacts(myPeerId);
      setContacts(list);
    }
  }, [myPeerId]);

  useEffect(() => {
    refreshContacts();
  }, [refreshContacts]);

  // Check URL parameters for peer invite link (?peer=xyz or #peer=xyz)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let target = params.get('peer');
    if (!target && window.location.hash.startsWith('#peer=')) {
      target = window.location.hash.replace('#peer=', '');
    }

    if (target && target !== myPeerId) {
      const cleanTarget = target.trim().toLowerCase();
      setRemotePeerId(cleanTarget);
      const contact = contactService.saveContact(myPeerId, cleanTarget, cleanTarget);
      refreshContacts();
      setActiveContact(contact || { peerId: cleanTarget, name: cleanTarget });
      setCurrentScreen('chat');

      // Auto initiate connection
      setTimeout(() => {
        handleConnect(cleanTarget);
      }, 600);
    }
  }, [myPeerId, refreshContacts]);

  // Register P2P Network listeners
  useEffect(() => {
    p2pService.on('onConnectionStateChange', (state) => {
      setConnectionState(state);
      refreshContacts();
    });

    p2pService.on('onIceStateChange', (state) => {
      setIceState(state);
    });

    p2pService.on('onIncomingCall', (info) => {
      setCallInfo(info);
      setCallState('incoming');
    });

    p2pService.on('onCallAccepted', () => {
      setCallState('connected');
    });

    p2pService.on('onCallRejected', () => {
      showToast('Call was declined by peer');
      handleEndCall();
    });

    p2pService.on('onCallEnded', () => {
      handleEndCall();
    });

    p2pService.on('onRemoteStream', (stream) => {
      setRemoteStream(stream);
      setCallState('connected');
    });

    // Refresh contact list when an incoming message is received to update timestamps and snippets
    p2pService.on('onMessage', () => {
      refreshContacts();
    });

    return () => {};
  }, [refreshContacts, showToast]);

  const handleConnect = (targetPeerId) => {
    const cleanId = (targetPeerId || remotePeerId).trim().toLowerCase();
    if (!cleanId || cleanId === myPeerId) return;
    setRemotePeerId(cleanId);
    setConnectionState('connecting');
    p2pService.connectToPeer(cleanId);
  };

  // User taps on a contact in Screen 1
  const handleSelectContact = (contact) => {
    setActiveContact(contact);
    setRemotePeerId(contact.peerId);
    setCurrentScreen('chat');

    // If not already connected to this peer, initiate direct WebRTC pairing
    if (connectionState !== 'connected' || remotePeerId !== contact.peerId) {
      handleConnect(contact.peerId);
    }
  };

  // User adds a new contact via the '+' corner button
  const handleAddContact = (targetId, nickname) => {
    const newContact = contactService.saveContact(myPeerId, targetId, nickname);
    refreshContacts();
    return newContact;
  };

  // User deletes a contact
  const handleDeleteContact = (targetId) => {
    const updated = contactService.deleteContact(myPeerId, targetId);
    setContacts(updated);
    showToast('Contact deleted');
    if (activeContact?.peerId?.toLowerCase() === targetId.toLowerCase()) {
      setActiveContact(null);
      setCurrentScreen('contacts');
    }
  };

  const handleStartCall = async (isVideo) => {
    if (!remotePeerId || connectionState !== 'connected') {
      showToast('Please wait until peer is connected');
      return;
    }

    try {
      setCallInfo({ peerId: remotePeerId, isVideo });
      setCallState('calling');
      const stream = await p2pService.initiateCall({ isVideo });
      setLocalStream(stream);
    } catch (err) {
      showToast(`Could not access camera/microphone: ${err.message}`);
      setCallState('idle');
    }
  };

  const handleAcceptCall = async ({ isVideo }) => {
    try {
      const stream = await p2pService.acceptCall({ isVideo });
      setLocalStream(stream);
      setCallState('connected');
    } catch (err) {
      showToast(`Could not start media: ${err.message}`);
      handleEndCall();
    }
  };

  const handleRejectCall = () => {
    p2pService.rejectCall();
    setCallState('idle');
    setCallInfo(null);
  };

  const handleEndCall = () => {
    p2pService.endCall();
    setCallState('idle');
    setCallInfo(null);
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    }
    setRemoteStream(null);
  };

  const handleUpdatePeerId = (newId) => {
    p2pService.setPeerId(newId);
    setMyPeerId(newId);
  };

  // Main UI Content (Screen 1: Contacts or Screen 2: Chat)
  const appContent = (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 font-sans select-none overflow-hidden relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/95 border border-slate-700 shadow-2xl text-xs font-medium text-slate-200 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {currentScreen === 'contacts' ? (
        /* Screen 1: Saved Contacts List against User's ID with '+' corner button */
        <ContactsScreen
          myPeerId={myPeerId}
          contacts={contacts}
          onSelectContact={handleSelectContact}
          onAddContact={handleAddContact}
          onDeleteContact={handleDeleteContact}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeRemotePeerId={remotePeerId}
          connectionState={connectionState}
        />
      ) : (
        /* Screen 2: Message & Media Segment with Back button */
        <ChatScreen
          p2p={p2pService}
          myPeerId={myPeerId}
          remotePeerId={remotePeerId}
          contactName={activeContact?.name || remotePeerId}
          connectionState={connectionState}
          onBack={() => {
            refreshContacts();
            setCurrentScreen('contacts');
          }}
          onStartCall={handleStartCall}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}

      {/* Active Audio/Video Call Screen Modal */}
      <CallScreen
        callState={callState}
        callInfo={callInfo}
        localStream={localStream}
        remoteStream={remoteStream}
        onAccept={handleAcceptCall}
        onReject={handleRejectCall}
        onEndCall={handleEndCall}
      />

      {/* Storage & Network & Screen Geometry Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        myPeerId={myPeerId}
        onUpdatePeerId={handleUpdatePeerId}
        metrics={metrics}
        activePreset={simulationPreset}
        onSelectPreset={setSimulationPreset}
      />
    </div>
  );

  // If a simulation preset is selected inside Settings, render in that simulated device frame
  if (simulationPreset && simulationPreset.width && simulationPreset.height) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-4 overflow-auto">
        {/* Simulator Info Banner */}
        <div className="mb-2 flex items-center justify-between w-full max-w-[500px] px-3 py-1.5 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-slate-200">{simulationPreset.name}</span>
            <span className="text-[10px] font-mono text-cyan-400">
              {simulationPreset.width} × {simulationPreset.height} px
            </span>
          </div>
          <button
            onClick={() => setSimulationPreset(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1 text-[11px]"
          >
            <span>Exit Test</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Device Bezel Frame */}
        <div
          style={{
            width: `${simulationPreset.width}px`,
            height: `${simulationPreset.height}px`,
            maxWidth: '100vw',
            maxHeight: '92vh',
          }}
          className="rounded-[36px] border-4 border-slate-700 shadow-2xl overflow-hidden flex flex-col bg-slate-950 relative"
        >
          {appContent}
        </div>
      </div>
    );
  }

  // Default: Native 100% Dynamic Responsive Fit to the User's Real Device Screen
  return (
    <div className="h-dynamic-screen w-full flex flex-col overflow-hidden bg-slate-950">
      {appContent}
    </div>
  );
}
