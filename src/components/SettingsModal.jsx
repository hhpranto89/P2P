import React, { useState } from 'react';
import {
  X,
  HardDrive,
  Cloud,
  Check,
  ShieldCheck,
  Smartphone,
  Globe,
  LogIn,
  LogOut,
  AlertCircle,
  HelpCircle,
  Key,
  Database,
  RefreshCw,
  Sliders,
  Activity,
  Tablet,
  Sparkles,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import storageService from '../services/storageService';
import { DEVICE_PRESETS } from '../hooks/useScreenMetrics';

export default function SettingsModal({
  isOpen,
  onClose,
  myPeerId,
  onUpdatePeerId,
  metrics,
  activePreset,
  onSelectPreset,
}) {
  const isNative = Capacitor.isNativePlatform();
  const [destination, setDestination] = useState(storageService.getDestinationPreference());
  const [googleClientId, setGoogleClientId] = useState(storageService.getGoogleClientId());
  const [googleUser, setGoogleUser] = useState(storageService.getGoogleUser());
  const [customPeerId, setCustomPeerId] = useState(myPeerId);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
  const [showDeviceSimulator, setShowDeviceSimulator] = useState(false);

  if (!isOpen) return null;

  const handleDestinationChange = (newDest) => {
    setDestination(newDest);
    storageService.setDestinationPreference(newDest);
  };

  const handleSaveClientId = () => {
    storageService.setGoogleClientId(googleClientId);
    setSaveSuccessMsg('Google Client ID saved.');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleGoogleConnect = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      storageService.setGoogleClientId(googleClientId);
      const res = await storageService.initGoogleAuth(googleClientId);
      setGoogleUser(res.user);
      setSaveSuccessMsg('Connected to Google Drive!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      setAuthError(err.message || 'Google authentication failed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleDisconnect = () => {
    storageService.disconnectGoogle();
    setGoogleUser(null);
  };

  const handleUpdatePeerId = (e) => {
    e.preventDefault();
    if (customPeerId.trim()) {
      onUpdatePeerId(customPeerId.trim());
      setSaveSuccessMsg('Peer ID updated!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">App Settings</h2>
              <p className="text-xs text-slate-400">Configure storage, screen fit & decentralization</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6 overflow-y-auto flex-1">
          {/* Success / Error Banners */}
          {saveSuccessMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {authError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Platform Status Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-800 text-cyan-400">
                {isNative ? <Smartphone className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-200">Runtime Environment</p>
                <p className="text-[11px] text-slate-400">
                  {isNative ? 'Android Native (@capacitor/filesystem)' : 'PWA Browser (File System Access API)'}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              {isNative ? 'Capacitor APK' : 'Chrome PWA'}
            </span>
          </div>

          {/* Screen Measurement & Device Geometry (Inside Settings) */}
          {metrics && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200">Screen & Device Geometry</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeviceSimulator(!showDeviceSimulator)}
                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition flex items-center gap-1.5"
                >
                  <Sliders className="w-3 h-3" />
                  <span>{showDeviceSimulator ? 'Hide Simulator' : 'Test Other Screens'}</span>
                </button>
              </div>

              {/* Primary Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Active Viewport (Auto-fit)</span>
                  <span className="font-mono text-cyan-300 font-semibold text-xs">
                    {metrics.visualViewportWidth} × {metrics.visualViewportHeight} px
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">100dvh Dynamic Viewport</span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Physical Hardware</span>
                  <span className="font-mono text-indigo-300 font-semibold text-xs">
                    {Math.round(metrics.screenWidth * metrics.dpr)} × {Math.round(metrics.screenHeight * metrics.dpr)} px
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5">{metrics.dpr.toFixed(2)}x DPR</span>
                </div>
              </div>

              {/* Secondary Details */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Device Category:</span>
                  <span className="text-slate-200 uppercase font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800">
                    {metrics.category}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Aspect Ratio:</span>
                  <span className="text-cyan-300 font-mono text-[10px]">{metrics.aspectRatio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Safe Area Insets:</span>
                  <span className="text-emerald-400 font-mono text-[10px]">
                    T: {metrics.safeArea.top}px • B: {metrics.safeArea.bottom}px
                  </span>
                </div>
              </div>

              {/* Optional Test Screen Simulator (Only when toggled inside Settings) */}
              {showDeviceSimulator && (
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  <p className="text-[11px] text-slate-400">
                    Simulate how the interface automatically fits different phone models:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {DEVICE_PRESETS.map((preset) => {
                      const isSelected = activePreset?.id === preset.id || (!activePreset && preset.id === 'real');
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            if (onSelectPreset) {
                              onSelectPreset(preset.id === 'real' ? null : preset);
                            }
                          }}
                          className={`w-full p-2 rounded-xl border text-left flex items-center justify-between text-xs transition ${
                            isSelected
                              ? 'bg-cyan-500/20 border-cyan-500 text-white font-medium'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <span>{preset.name}</span>
                            <span className="block text-[10px] text-slate-400">
                              {preset.width ? `${preset.width} × ${preset.height} px` : 'Real Device (Native)'}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500 text-slate-950 font-bold">
                              Selected
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Storage Destination Preference */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Default Media Download Target
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Option 1: Local Device */}
              <button
                type="button"
                onClick={() => handleDestinationChange('local')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                  destination === 'local'
                    ? 'bg-cyan-500/10 border-cyan-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <HardDrive className={`w-4 h-4 ${destination === 'local' ? 'text-cyan-400' : 'text-slate-400'}`} />
                  {destination === 'local' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                </div>
                <div>
                  <p className="text-xs font-semibold">Local Device</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Documents / Disk</p>
                </div>
              </button>

              {/* Option 2: Google Drive */}
              <button
                type="button"
                onClick={() => handleDestinationChange('drive')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                  destination === 'drive'
                    ? 'bg-indigo-500/10 border-indigo-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Cloud className={`w-4 h-4 ${destination === 'drive' ? 'text-indigo-400' : 'text-slate-400'}`} />
                  {destination === 'drive' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
                <div>
                  <p className="text-xs font-semibold">Google Drive</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Direct Cloud Sync</p>
                </div>
              </button>

              {/* Option 3: Always Ask */}
              <button
                type="button"
                onClick={() => handleDestinationChange('ask')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                  destination === 'ask'
                    ? 'bg-emerald-500/10 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <HelpCircle className={`w-4 h-4 ${destination === 'ask' ? 'text-emerald-400' : 'text-slate-400'}`} />
                  {destination === 'ask' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div>
                  <p className="text-xs font-semibold">Prompt Me</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Choose on download</p>
                </div>
              </button>
            </div>
          </div>

          {/* Google Drive OAuth Configuration */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-bold text-slate-200">Google Drive Integration (OAuth 2.0)</span>
              </div>
              {googleUser ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Connected
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  Not Connected
                </span>
              )}
            </div>

            {googleUser ? (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {googleUser.picture ? (
                    <img src={googleUser.picture} alt="Avatar" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                      {googleUser.name?.charAt(0) || 'G'}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{googleUser.name || 'Google User'}</p>
                    <p className="text-[10px] text-slate-400">{googleUser.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoogleDisconnect}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                  title="Disconnect Account"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                    <Key className="w-3 h-3 text-cyan-400" />
                    <span>Google OAuth Client ID</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={googleClientId}
                      onChange={(e) => setGoogleClientId(e.target.value)}
                      placeholder="e.g. 123456789-xyz.apps.googleusercontent.com"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-400 outline-none focus:border-cyan-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleSaveClientId}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition"
                    >
                      Save
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    Create in Google Cloud Console with scope <code>drive.file</code> and Authorized JS Origins for your Netlify URL.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleConnect}
                  disabled={isAuthenticating}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-indigo-600/20"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isAuthenticating ? 'Authorizing...' : 'Sign in with Google Drive'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Decentralized Peer Identity */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-200">Decentralized Peer Identity</span>
            </div>
            <form onSubmit={handleUpdatePeerId} className="flex gap-2">
              <input
                type="text"
                value={customPeerId}
                onChange={(e) => setCustomPeerId(e.target.value)}
                placeholder="Custom Peer ID"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-cyan-300 font-mono outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white transition flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Update</span>
              </button>
            </form>
            <p className="text-[10px] text-slate-400">
              Signaling is routed over serverless Gun.js mesh relays without any central database.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
