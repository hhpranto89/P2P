import React, { useState } from 'react';
import {
  Radio,
  Settings,
  Plus,
  Search,
  User,
  Copy,
  Check,
  Share2,
  Trash2,
  MessageSquare,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Phone,
  Video,
  AlertTriangle,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

// Generates consistent vivid gradient for contact avatars based on string
const AVATAR_GRADIENTS = [
  'from-cyan-500 to-blue-600',
  'from-indigo-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-violet-500 to-fuchsia-600',
];

function getAvatarGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ContactsScreen({
  myPeerId,
  contacts,
  onSelectContact,
  onAddContact,
  onDeleteContact,
  onOpenSettings,
  activeRemotePeerId,
  connectionState,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState(null); // Contact currently pending deletion confirmation
  const [newPeerId, setNewPeerId] = useState('');
  const [newName, setNewName] = useState('');
  const [copiedMyId, setCopiedMyId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inputError, setInputError] = useState('');

  // Filter contacts by search query
  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.peerId.toLowerCase().includes(q)
    );
  });

  const handleCopyMyId = () => {
    navigator.clipboard.writeText(myPeerId);
    setCopiedMyId(true);
    setTimeout(() => setCopiedMyId(false), 2000);
  };

  const handleCopyShareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?peer=${encodeURIComponent(myPeerId)}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePastePeerId = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setNewPeerId(text.trim());
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setInputError('');

    const targetId = newPeerId.trim().toLowerCase();
    if (!targetId) {
      setInputError('Please enter a valid Peer ID.');
      return;
    }

    if (targetId === myPeerId.toLowerCase()) {
      setInputError('Cannot add your own Peer ID.');
      return;
    }

    const created = onAddContact(targetId, newName.trim() || targetId);
    setNewPeerId('');
    setNewName('');
    setIsAddModalOpen(false);

    if (created) {
      onSelectContact(created);
    }
  };

  const handleConfirmDelete = () => {
    if (contactToDelete) {
      onDeleteContact(contactToDelete.peerId);
      setContactToDelete(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden relative w-full">
      {/* 1. Top Header */}
      <header
        className="min-h-14 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between z-20 shrink-0"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-bold text-white tracking-tight">Nexus P2P</h1>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                Decentralized
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono hidden xs:block">
              Serverless Encrypted Mesh
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <PWAInstallButton />

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Settings & Screen Geometry"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. My Identity Card (Current user ID & quick invite) */}
      <div className="px-3 sm:px-4 py-2.5 bg-slate-900/50 border-b border-slate-800/80 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                My Peer ID
              </span>
              <p className="text-xs font-mono font-semibold text-cyan-300 truncate">
                {myPeerId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopyMyId}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 text-xs"
              title="Copy My ID"
            >
              {copiedMyId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="text-[10px] hidden sm:inline">{copiedMyId ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleCopyShareLink}
              className="p-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 text-indigo-300 hover:text-white border border-indigo-800/50 transition flex items-center gap-1 text-xs"
              title="Share Link"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="text-[10px] hidden sm:inline">{copiedLink ? 'Copied' : 'Share'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Search Bar */}
      <div className="px-3 sm:px-4 pt-3 pb-1 max-w-2xl mx-auto w-full shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name or ID..."
            className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-2xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-400 outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Contacts List */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-2 max-w-2xl mx-auto w-full space-y-1.5 pb-24">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-4">
            <div className="h-16 w-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
              <MessageSquare className="h-8 w-8 text-cyan-400/80" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">
              {contacts.length === 0 ? 'No contacts saved yet' : 'No contacts found'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
              {contacts.length === 0
                ? "Tap the '+' button in the corner to add and message a peer ID."
                : 'No saved contacts match your search query.'}
            </p>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const isCurrentlyActive =
              activeRemotePeerId?.toLowerCase() === contact.peerId.toLowerCase();
            const isOnline = isCurrentlyActive && connectionState === 'connected';
            const gradient = getAvatarGradient(contact.peerId);
            const initial = (contact.name || contact.peerId).charAt(0).toUpperCase();

            return (
              <div
                key={contact.peerId}
                onClick={() => onSelectContact(contact)}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 group ${
                  isCurrentlyActive
                    ? 'bg-slate-900/90 border-cyan-500/40 shadow-lg shadow-cyan-950/30'
                    : 'bg-slate-900/40 hover:bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${gradient} flex items-center justify-center text-white font-bold text-base shadow-md`}
                    >
                      {initial}
                    </div>
                    {/* Status Dot */}
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                        isOnline
                          ? 'bg-emerald-500'
                          : isCurrentlyActive && connectionState === 'connecting'
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-slate-600'
                      }`}
                      title={isOnline ? 'Connected' : 'Saved Peer'}
                    />
                  </div>

                  {/* Name and Last Message */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-100 truncate group-hover:text-cyan-300 transition">
                        {contact.name || contact.peerId}
                      </h4>
                      {isCurrentlyActive && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 truncate">
                      {contact.peerId}
                    </p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {contact.lastMessage || 'Tap to chat...'}
                    </p>
                  </div>
                </div>

                {/* Right side: Timestamp & delete action */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatTime(contact.lastMessageTime)}
                  </span>

                  {/* Direct, reliable custom modal trigger for deletion */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContactToDelete(contact);
                    }}
                    className="p-2 rounded-xl bg-slate-800/40 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition active:scale-95"
                    title={`Delete ${contact.name || contact.peerId}`}
                    aria-label={`Delete ${contact.name || contact.peerId}`}
                  >
                    <Trash2 className="w-4 h-4 text-slate-400 hover:text-rose-400" />
                  </button>

                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Corner '+' Floating Action Button (FAB) */}
      <div
        className="fixed bottom-6 right-6 z-30 pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button
          onClick={() => {
            setInputError('');
            setIsAddModalOpen(true);
          }}
          className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-cyan-600 via-cyan-500 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-xl shadow-cyan-600/40 flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105"
          title="Add New Contact"
          aria-label="Add New Contact"
        >
          <Plus className="w-7 h-7 stroke-[2.5]" />
        </button>
      </div>

      {/* 6. In-App Delete Confirmation Modal (100% reliable, never blocked by iframe) */}
      {contactToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 shadow-2xl relative">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Delete Contact</h3>
                <p className="text-[11px] text-slate-400 truncate">
                  {contactToDelete.name || contactToDelete.peerId}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 mt-4 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-white">"{contactToDelete.name || contactToDelete.peerId}"</span>? This contact and its saved chat history will be deleted from your device.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setContactToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-lg shadow-rose-600/30 active:scale-95 transition"
              >
                Delete Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Add Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add New Contact</h3>
                  <p className="text-[11px] text-slate-400">Save peer ID to your contacts list</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-3.5">
              {inputError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  {inputError}
                </div>
              )}

              {/* Peer ID Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Peer ID *
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    required
                    value={newPeerId}
                    onChange={(e) => setNewPeerId(e.target.value)}
                    placeholder="e.g. nexus-abc123"
                    className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs font-mono text-cyan-300 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handlePastePeerId}
                    className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                    title="Paste from clipboard"
                  >
                    Paste
                  </button>
                </div>
              </div>

              {/* Name / Nickname Input */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Name / Nickname (Optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Alice, Work Laptop, Friend..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-lg shadow-cyan-600/30 active:scale-95 transition"
                >
                  Save & Message
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
