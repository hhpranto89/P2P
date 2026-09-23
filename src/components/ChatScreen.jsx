import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Square,
  FileCheck,
  Download,
  HardDrive,
  Cloud,
  FileText,
  Video as VideoIcon,
  Music,
  Image as ImageIcon,
  CheckCheck,
  Sparkles,
  ExternalLink,
  Loader2,
  AlertCircle,
  Play,
  Pause,
  ArrowLeft,
  Phone,
  Video,
  User,
} from 'lucide-react';
import storageService from '../services/storageService';
import contactService from '../services/contactService';

const CHUNK_SIZE = 16384; // 16KB chunk size for reliable WebRTC DataChannel transport

export default function ChatScreen({
  p2p,
  myPeerId,
  remotePeerId,
  contactName,
  connectionState,
  onBack,
  onStartCall,
  onOpenSettings,
  onRetryConnect,
}) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [activeTransfer, setActiveTransfer] = useState(null); // { id, name, progress, type: 'send' | 'receive' }
  const [storageNotification, setStorageNotification] = useState(null);
  const [savingFileId, setSavingFileId] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  // Buffer for assembling incoming chunks for files
  const incomingFilesRef = useRef(new Map());

  // Load chat history when switching peers
  useEffect(() => {
    if (myPeerId && remotePeerId) {
      const history = contactService.getChatHistory(myPeerId, remotePeerId);
      setMessages(history);
    }
  }, [myPeerId, remotePeerId]);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeTransfer]);

  // Wire up P2P Network Data Channel events
  useEffect(() => {
    if (!p2p) return;

    // Incoming text/control messages
    p2p.on('onMessage', (msg) => {
      if (msg.type === 'chat') {
        const newMsg = {
          id: msg.id || `msg_${Date.now()}`,
          text: msg.text,
          sender: msg.sender || remotePeerId,
          timestamp: msg.timestamp || Date.now(),
          isSelf: false,
        };

        setMessages((prev) => [...prev, newMsg]);

        if (myPeerId && remotePeerId) {
          contactService.saveChatMessage(myPeerId, remotePeerId, newMsg);
          contactService.updateLastMessage(myPeerId, remotePeerId, msg.text, newMsg.timestamp);
        }
      }
    });

    // Incoming file metadata header
    p2p.on('onFileMeta', (meta) => {
      const { fileId, name, size, mimeType, totalChunks, thumbnail } = meta;
      incomingFilesRef.current.set(fileId, {
        meta,
        receivedChunks: new Map(),
        totalChunks,
        totalBytes: size,
      });

      setActiveTransfer({
        id: fileId,
        name,
        size,
        progress: 0,
        type: 'receive',
      });
    });

    // Incoming file chunk
    p2p.on('onFileChunk', (chunkData) => {
      const { fileId, index, chunk } = chunkData;
      const fileEntry = incomingFilesRef.current.get(fileId);
      if (!fileEntry) return;

      fileEntry.receivedChunks.set(index, chunk);
      const receivedCount = fileEntry.receivedChunks.size;
      const progress = Math.min(100, Math.round((receivedCount / fileEntry.totalChunks) * 100));

      setActiveTransfer((prev) => (prev && prev.id === fileId ? { ...prev, progress } : prev));

      // When all chunks are received
      if (receivedCount === fileEntry.totalChunks) {
        // Reconstruct binary blob from base64 chunks
        const sortedChunks = [];
        for (let i = 0; i < fileEntry.totalChunks; i++) {
          const b64 = fileEntry.receivedChunks.get(i);
          if (b64) {
            sortedChunks.push(base64ToArrayBuffer(b64));
          }
        }

        const reconstructedBlob = new Blob(sortedChunks, { type: fileEntry.meta.mimeType });
        const objectUrl = URL.createObjectURL(reconstructedBlob);

        // Add to messages as received original-quality file card
        const newFileMessage = {
          id: fileId,
          type: 'file',
          sender: remotePeerId,
          isSelf: false,
          timestamp: fileEntry.meta.timestamp || Date.now(),
          file: {
            name: fileEntry.meta.name,
            size: fileEntry.meta.size,
            mimeType: fileEntry.meta.mimeType,
            thumbnail: fileEntry.meta.thumbnail || null,
            blob: reconstructedBlob,
            url: objectUrl,
            savedLocation: null,
          },
        };

        setMessages((prev) => [...prev, newFileMessage]);
        incomingFilesRef.current.delete(fileId);
        setActiveTransfer(null);

        if (myPeerId && remotePeerId) {
          contactService.saveChatMessage(myPeerId, remotePeerId, {
            ...newFileMessage,
            file: { ...newFileMessage.file, blob: null },
          });
          contactService.updateLastMessage(
            myPeerId,
            remotePeerId,
            `📎 ${fileEntry.meta.name}`,
            newFileMessage.timestamp
          );
        }
      }
    });

    return () => {};
  }, [p2p, remotePeerId, myPeerId]);

  // Convert Base64 string to ArrayBuffer
  const base64ToArrayBuffer = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Convert ArrayBuffer to Base64 string
  const arrayBufferToBase64 = (buffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Send regular text message
  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || connectionState !== 'connected') return;

    const payload = p2p.sendChatMessage(inputMessage.trim());
    if (payload) {
      const sentMsg = {
        id: payload.id,
        text: payload.text,
        sender: p2p.getMyPeerId(),
        timestamp: payload.timestamp,
        isSelf: true,
      };

      setMessages((prev) => [...prev, sentMsg]);
      setInputMessage('');

      if (myPeerId && remotePeerId) {
        contactService.saveChatMessage(myPeerId, remotePeerId, sentMsg);
        contactService.updateLastMessage(myPeerId, remotePeerId, sentMsg.text, sentMsg.timestamp);
      }
    }
  };

  // Generate lightweight low-res thumbnail for image/video preview
  const generatePreviewThumbnail = async (file) => {
    if (file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 80;
          let w = img.width;
          let h = img.height;
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    return null;
  };

  // Send File with 100% Original Quality Chunking
  const handleSendFile = async (file) => {
    if (!file || connectionState !== 'connected') return;

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const thumbnail = await generatePreviewThumbnail(file);

    // 1. Send file metadata header packet
    const metaPayload = {
      type: 'file-meta',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize: CHUNK_SIZE,
      thumbnail,
      timestamp: Date.now(),
    };

    p2p.sendData(metaPayload);

    // Optimistically add to self message list
    const fileMessage = {
      id: fileId,
      type: 'file',
      sender: p2p.getMyPeerId(),
      isSelf: true,
      timestamp: Date.now(),
      file: {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        thumbnail,
        blob: file,
        url: URL.createObjectURL(file),
      },
    };
    setMessages((prev) => [...prev, fileMessage]);

    if (myPeerId && remotePeerId) {
      contactService.saveChatMessage(myPeerId, remotePeerId, {
        ...fileMessage,
        file: { ...fileMessage.file, blob: null },
      });
      contactService.updateLastMessage(
        myPeerId,
        remotePeerId,
        `📎 ${file.name}`,
        fileMessage.timestamp
      );
    }

    setActiveTransfer({
      id: fileId,
      name: file.name,
      size: file.size,
      progress: 0,
      type: 'send',
    });

    // 2. Read and stream chunks over DataChannel
    try {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const slice = file.slice(start, end);

        const arrayBuf = await slice.arrayBuffer();
        const base64Chunk = arrayBufferToBase64(arrayBuf);

        await p2p.sendChunkWithBackpressure({
          type: 'file-chunk',
          fileId,
          index: i,
          chunk: base64Chunk,
        });

        const progress = Math.min(100, Math.round(((i + 1) / totalChunks) * 100));
        setActiveTransfer((prev) => (prev && prev.id === fileId ? { ...prev, progress } : prev));
      }
    } catch (err) {
      console.error('[FileTransfer] Chunk send error:', err);
    } finally {
      setTimeout(() => {
        setActiveTransfer(null);
      }, 600);
    }
  };

  // Voice Note Recorder Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const rawAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(rawAudioBlob);
        setAudioUrl(URL.createObjectURL(rawAudioBlob));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordDuration(0);

      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start voice recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordTimerRef.current);
    }
  };

  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordDuration(0);
  };

  const sendVoiceRecording = () => {
    if (!audioBlob) return;
    const fileName = `voice_note_${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    const audioFile = new File([audioBlob], fileName, { type: 'audio/webm' });
    handleSendFile(audioFile);
    cancelRecording();
  };

  // Format bytes to human readable format (MB, KB)
  const formatBytes = (bytes) => {
    if (!bytes && bytes !== 0) return '0 B';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Download controller action
  const handleSaveFile = async (msgId, file, targetOverride = null) => {
    const preference = targetOverride || storageService.getDestinationPreference();
    setSavingFileId(msgId);

    try {
      if (preference === 'drive') {
        if (!storageService.isGoogleConnected()) {
          setStorageNotification({
            type: 'error',
            text: 'Google Drive is not connected. Opening settings to authorize...',
          });
          onOpenSettings();
          return;
        }

        const result = await storageService.saveToGoogleDrive(file.blob, file.name, file.mimeType);
        setStorageNotification({
          type: 'success',
          text: `Saved to Google Drive!`,
          link: result.link,
        });

        // Update message state
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, file: { ...m.file, savedLocation: 'Google Drive', driveLink: result.link } } : m
          )
        );
      } else {
        // Save to Local Device (Capacitor or Chrome File System Access API)
        const result = await storageService.saveToDevice(file.blob, file.name, file.mimeType);
        if (result.success) {
          setStorageNotification({
            type: 'success',
            text: result.message || 'Saved to Device!',
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, file: { ...m.file, savedLocation: 'Device Storage' } } : m
            )
          );
        }
      }
    } catch (err) {
      setStorageNotification({
        type: 'error',
        text: err.message || 'Failed to save file.',
      });
    } finally {
      setSavingFileId(null);
      setTimeout(() => setStorageNotification(null), 5000);
    }
  };

  // Get file type icon
  const getFileIcon = (mimeType) => {
    if (!mimeType) return <FileText className="w-5 h-5 text-indigo-400" />;
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-cyan-400" />;
    if (mimeType.startsWith('video/')) return <VideoIcon className="w-5 h-5 text-amber-400" />;
    if (mimeType.startsWith('audio/')) return <Music className="w-5 h-5 text-emerald-400" />;
    return <FileText className="w-5 h-5 text-indigo-400" />;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden relative w-full">
      {/* Top Chat Header Bar */}
      <div
        className="min-h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between z-30 shrink-0"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Back button to return to Screen 1 (Contacts list) */}
          <button
            onClick={onBack}
            className="p-2 -ml-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1 shrink-0 active:scale-95"
            title="Back to Contacts"
            aria-label="Back to Contacts"
          >
            <ArrowLeft className="w-5 h-5 text-cyan-400" />
          </button>

          {/* Contact Avatar */}
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-md">
            {(contactName || remotePeerId || 'P').charAt(0).toUpperCase()}
          </div>

          {/* Name & Peer ID & Connection status */}
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold text-white truncate">
              {contactName || remotePeerId}
            </h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  connectionState === 'connected'
                    ? 'bg-emerald-400'
                    : connectionState === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-rose-400'
                }`}
              />
              <span className="text-[10px] text-slate-400 font-mono truncate">
                {connectionState === 'connected'
                  ? 'Connected'
                  : connectionState === 'connecting'
                  ? 'Connecting...'
                  : 'Offline'}
              </span>
              {connectionState !== 'connected' && onRetryConnect && (
                <button
                  type="button"
                  onClick={onRetryConnect}
                  className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/60 font-mono transition"
                  title="Retry P2P connection"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Audio and Video Call Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={() => onStartCall && onStartCall(false)}
            disabled={connectionState !== 'connected'}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition disabled:opacity-30 disabled:pointer-events-none"
            title="Audio Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          <button
            onClick={() => onStartCall && onStartCall(true)}
            disabled={connectionState !== 'connected'}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition disabled:opacity-30 disabled:pointer-events-none"
            title="Video Call"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Toast Storage Notification */}
      {storageNotification && (
        <div className="absolute top-3 left-3 right-3 sm:left-4 sm:right-4 z-40 flex items-center justify-between p-3 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 text-xs font-medium text-slate-200">
            {storageNotification.type === 'success' ? (
              <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="truncate">{storageNotification.text}</span>
          </div>
          {storageNotification.link && (
            <a
              href={storageNotification.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cyan-400 font-semibold hover:underline shrink-0 ml-2"
            >
              <span>View</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Connection State Info Banner */}
      {connectionState === 'connecting' && (
        <div className="px-3 sm:px-4 py-2 bg-amber-950/40 border-b border-amber-500/20 text-amber-300 text-xs flex items-center justify-between gap-2 shrink-0 animate-in fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span className="truncate">
              Connecting to <strong className="font-mono">{remotePeerId}</strong> (ensure both devices have the app open)
            </span>
          </div>
          {onRetryConnect && (
            <button
              onClick={onRetryConnect}
              className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold text-[11px] shrink-0 transition"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4 max-w-4xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6 text-slate-400">
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 mb-3 shadow-inner">
              <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 animate-pulse" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-200">Direct P2P Encrypted Session</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed px-2">
              No central server in between. Text messages and original quality files stream directly from peer to peer.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isSelf = msg.isSelf;

          if (msg.type === 'file') {
            const { file } = msg;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-md rounded-3xl p-4 border transition-all ${
                    isSelf
                      ? 'bg-gradient-to-br from-indigo-950/80 to-slate-900 border-indigo-800/60 shadow-lg'
                      : 'bg-slate-900/90 border-slate-800 shadow-md'
                  }`}
                >
                  {/* File Metadata Card (Rule: Received files must NOT automatically render at full resolution) */}
                  <div className="flex items-start gap-3">
                    {/* Thumbnail preview if available, blurred or framed */}
                    {file.thumbnail ? (
                      <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-slate-700 bg-slate-950">
                        <img
                          src={file.thumbnail}
                          alt="Thumbnail preview"
                          className="w-full h-full object-cover blur-[0.5px] scale-105"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        {getFileIcon(file.mimeType)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-cyan-400 font-medium">
                          {formatBytes(file.size)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                          Original Quality
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">
                        {file.mimeType || 'binary/stream'}
                      </p>
                    </div>
                  </div>

                  {/* Audio player if audio voice note */}
                  {file.mimeType?.startsWith('audio/') && file.url && (
                    <div className="mt-3 pt-2 border-t border-slate-800/80">
                      <audio controls src={file.url} className="w-full h-8 opacity-90" />
                    </div>
                  )}

                  {/* Download & Save Action Controllers */}
                  <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    {file.savedLocation ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <FileCheck className="w-4 h-4" />
                        <span>Saved to {file.savedLocation}</span>
                        {file.driveLink && (
                          <a
                            href={file.driveLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-400 hover:underline inline-flex items-center ml-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 w-full">
                        <button
                          disabled={savingFileId === msg.id}
                          onClick={() => handleSaveFile(msg.id, file, 'local')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-xs font-medium text-slate-200 border border-slate-700 transition"
                        >
                          {savingFileId === msg.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                          )}
                          <span>Save to Device</span>
                        </button>

                        <button
                          disabled={savingFileId === msg.id}
                          onClick={() => handleSaveFile(msg.id, file, 'drive')}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 active:bg-indigo-800 text-xs font-medium text-indigo-200 border border-indigo-700/50 transition"
                        >
                          <Cloud className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Google Drive</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <span className="text-[10px] text-slate-400 mt-1 px-2 font-mono">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          }

          // Text Message
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[80%] sm:max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                  isSelf
                    ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-br-none shadow-md shadow-cyan-900/20'
                    : 'bg-slate-900 text-slate-100 rounded-bl-none border border-slate-800 shadow-sm'
                }`}
              >
                <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-2 font-mono">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          );
        })}

        {/* Live Transfer Progress Pill */}
        {activeTransfer && (
          <div className="sticky bottom-2 z-30 p-3 rounded-2xl bg-slate-900/95 border border-cyan-500/30 backdrop-blur-md shadow-2xl animate-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
              <span className="text-slate-200 truncate max-w-[200px]">
                {activeTransfer.type === 'send' ? 'Streaming' : 'Receiving'}: {activeTransfer.name}
              </span>
              <span className="text-cyan-400 font-mono font-bold">{activeTransfer.progress}%</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                style={{ width: `${activeTransfer.progress}%` }}
                className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 transition-all duration-200"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
              <span>Original binary chunks ({CHUNK_SIZE / 1024} KB)</span>
              <span>100% uncompressed</span>
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Audio Recorder Panel (Active Recording State) */}
      {isRecording && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-rose-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-rose-400">
              Recording Voice: {Math.floor(recordDuration / 60)}:
              {(recordDuration % 60).toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              onClick={stopRecording}
              className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white flex items-center gap-1.5 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* Audio Preview Before Sending */}
      {audioBlob && !isRecording && (
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 flex-1">
            <Music className="w-5 h-5 text-emerald-400 shrink-0" />
            <audio controls src={audioUrl} className="h-8 max-w-[200px] sm:max-w-sm" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
            >
              Discard
            </button>
            <button
              onClick={sendVoiceRecording}
              className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white flex items-center gap-1.5 shadow-lg shadow-cyan-600/30"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Voice Note</span>
            </button>
          </div>
        </div>
      )}

      {/* Chat Input Bar */}
      <div className="bg-slate-900/95 border-t border-slate-800 pb-safe w-full">
        <form
          onSubmit={handleSendMessage}
          className="p-2 sm:p-3 max-w-4xl mx-auto flex items-center gap-1.5 sm:gap-2 relative z-10"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleSendFile(file);
                e.target.value = '';
              }
            }}
          />

          {/* Attach File Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={connectionState !== 'connected'}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition disabled:opacity-40 shrink-0"
            title="Send original file (Photos, Videos, Audio, Docs)"
          >
            <Paperclip className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Voice Note Button */}
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={connectionState !== 'connected'}
            className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl transition disabled:opacity-40 shrink-0 ${
              isRecording
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700'
            }`}
            title="Record Voice Note"
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={
              connectionState === 'connected'
                ? 'Type an encrypted message...'
                : 'Waiting for peer...'
            }
            disabled={connectionState !== 'connected'}
            className="flex-1 min-w-0 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-400 outline-none transition disabled:opacity-50"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputMessage.trim() || connectionState !== 'connected'}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white transition disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-cyan-600/30 shrink-0"
            title="Send Message"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
