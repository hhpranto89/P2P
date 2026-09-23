import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  PhoneCall,
  SwitchCamera,
  Maximize2,
  Minimize2,
  Volume2,
  ShieldCheck,
  Radio,
} from 'lucide-react';

export default function CallScreen({
  callState, // 'idle' | 'calling' | 'incoming' | 'connected'
  callInfo,  // { peerId, isVideo, callerName }
  localStream,
  remoteStream,
  onAccept,
  onReject,
  onEndCall,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioWaves, setAudioWaves] = useState([20, 45, 80, 50, 30, 70, 90, 40]);

  // Audio wave animation timer
  useEffect(() => {
    if (callState === 'connected') {
      const interval = setInterval(() => {
        setAudioWaves([
          Math.floor(Math.random() * 80) + 15,
          Math.floor(Math.random() * 95) + 20,
          Math.floor(Math.random() * 90) + 25,
          Math.floor(Math.random() * 100) + 15,
          Math.floor(Math.random() * 85) + 20,
          Math.floor(Math.random() * 95) + 25,
          Math.floor(Math.random() * 80) + 15,
          Math.floor(Math.random() * 70) + 20,
        ]);
      }, 250);
      return () => clearInterval(interval);
    }
  }, [callState]);

  // Call duration stopwatch
  useEffect(() => {
    let timer;
    if (callState === 'connected') {
      setCallDuration(0);
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Attach media streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!audioTracks[0]?.enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((track) => {
          track.enabled = !track.enabled;
        });
        setIsVideoDisabled(!videoTracks[0]?.enabled);
      }
    }
  };

  const flipCamera = async () => {
    if (!localStream) return;
    try {
      const currentTrack = localStream.getVideoTracks()[0];
      if (!currentTrack) return;
      
      const currentFacing = currentTrack.getSettings()?.facingMode;
      const newFacing = currentFacing === 'user' ? 'environment' : 'user';
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
      });
      const newTrack = newStream.getVideoTracks()[0];
      
      // Replace track on local stream
      localStream.removeTrack(currentTrack);
      currentTrack.stop();
      localStream.addTrack(newTrack);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
    } catch (err) {
      console.warn('Camera switch error:', err);
    }
  };

  const formatDuration = (secs) => {
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
  };

  // 1. Incoming Call Dialog View
  if (callState === 'incoming') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
        <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-radial from-cyan-500/10 via-transparent to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex flex-col items-center">
            {/* Pulsing Avatar */}
            <div className="relative my-4 flex items-center justify-center">
              <div className="absolute h-28 w-28 rounded-full bg-cyan-500/20 animate-ping" />
              <div className="absolute h-24 w-24 rounded-full bg-cyan-500/40 animate-pulse" />
              <div className="h-20 w-20 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/30">
                <PhoneCall className="h-9 w-9 animate-bounce text-white" />
              </div>
            </div>

            <h3 className="text-xl font-bold text-white tracking-tight">Incoming {callInfo?.isVideo ? 'Video' : 'Voice'} Call</h3>
            <p className="mt-1 text-sm font-medium text-cyan-400 font-mono">{callInfo?.callerName || callInfo?.peerId}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 text-xs text-slate-300 border border-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Direct P2P Encrypted</span>
            </div>

            {/* Accept / Decline actions */}
            <div className="mt-8 flex w-full items-center justify-around gap-4">
              <button
                onClick={onReject}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="h-14 w-14 rounded-full bg-red-600 group-hover:bg-red-500 transition flex items-center justify-center text-white shadow-lg shadow-red-600/30">
                  <PhoneOff className="h-6 w-6" />
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-200">Decline</span>
              </button>

              <button
                onClick={() => onAccept({ isVideo: false })}
                className="flex flex-col items-center gap-1 group"
              >
                <div className="h-14 w-14 rounded-full bg-emerald-600 group-hover:bg-emerald-500 transition flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                  <Volume2 className="h-6 w-6" />
                </div>
                <span className="text-xs text-slate-400 group-hover:text-slate-200">Voice Only</span>
              </button>

              {callInfo?.isVideo && (
                <button
                  onClick={() => onAccept({ isVideo: true })}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div className="h-14 w-14 rounded-full bg-cyan-600 group-hover:bg-cyan-500 transition flex items-center justify-center text-white shadow-lg shadow-cyan-600/30">
                    <Video className="h-6 w-6" />
                  </div>
                  <span className="text-xs text-slate-400 group-hover:text-slate-200">Video</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Call or Calling Out View
  if (callState === 'calling' || callState === 'connected') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden h-dynamic-screen w-full">
        {/* Top Header Bar */}
        <div
          className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-xs font-mono text-cyan-300">
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="truncate max-w-[120px] sm:max-w-none">{callInfo?.peerId}</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
              {callState === 'calling' ? 'Calling...' : formatDuration(callDuration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Video Canvas / Audio Viewport */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
          {callInfo?.isVideo && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            /* Audio Only Display */
            <div className="flex flex-col items-center justify-center p-4 sm:p-6 text-center">
              <div className="relative flex items-center justify-center mb-4 sm:mb-6">
                <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-full bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 animate-pulse flex items-center justify-center">
                  <div className="h-18 w-18 sm:h-24 sm:w-24 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white text-xl sm:text-2xl font-bold shadow-2xl">
                    {callInfo?.peerId?.slice(0, 2).toUpperCase() || 'P2P'}
                  </div>
                </div>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{callInfo?.callerName || callInfo?.peerId}</h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-400">
                {callState === 'calling' ? 'Ringing peer directly...' : 'Secure WebRTC Peer Stream'}
              </p>

              {/* Animated audio wave bars */}
              {callState === 'connected' && (
                <div className="mt-6 sm:mt-8 flex items-center justify-center gap-1.5 h-10 sm:h-12">
                  {audioWaves.map((height, i) => (
                    <div
                      key={i}
                      style={{ height: `${height}%` }}
                      className="w-1 sm:w-1.5 rounded-full bg-gradient-to-t from-cyan-500 to-indigo-400 transition-all duration-200"
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Picture-in-Picture Local Video Preview */}
          {callInfo?.isVideo && localStream && (
            <div className="absolute bottom-4 right-4 z-20 w-24 h-34 sm:w-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoDisabled ? 'hidden' : ''}`}
              />
              {isVideoDisabled && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 text-xs">
                  <VideoOff className="w-5 h-5 sm:w-6 sm:h-6 mb-1" />
                  <span>Cam Off</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        <div
          className="relative z-20 px-4 py-4 sm:py-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex items-center justify-center gap-3 sm:gap-4"
          style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 0px))' }}
        >
          {/* Mute Audio Toggle */}
          <button
            onClick={toggleMute}
            className={`p-3.5 sm:p-4 rounded-full transition shadow-lg ${
              isMuted
                ? 'bg-amber-600 text-white shadow-amber-600/30'
                : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>

          {/* Video Toggle (If video enabled) */}
          {callInfo?.isVideo && (
            <>
              <button
                onClick={toggleVideo}
                className={`p-3.5 sm:p-4 rounded-full transition shadow-lg ${
                  isVideoDisabled
                    ? 'bg-amber-600 text-white shadow-amber-600/30'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title={isVideoDisabled ? 'Turn Cam On' : 'Turn Cam Off'}
              >
                {isVideoDisabled ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>

              <button
                onClick={flipCamera}
                className="p-3.5 sm:p-4 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
                title="Switch Camera"
              >
                <SwitchCamera className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </>
          )}

          {/* End Call / Hang Up */}
          <button
            onClick={onEndCall}
            className="p-3.5 sm:p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/40 transition active:scale-95"
            title="End Call"
          >
            <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
