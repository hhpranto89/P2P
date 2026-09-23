/**
 * Contact and Chat History Manager
 * Persists saved contacts and messages indexed by user ID and peer ID in localStorage
 */

const CONTACTS_PREFIX = 'nexus_contacts_';
const CHAT_PREFIX = 'nexus_chats_';

export class ContactService {
  /**
   * Get all contacts saved against a specific User Peer ID
   */
  getContacts(myPeerId) {
    if (!myPeerId) return [];
    try {
      const raw = localStorage.getItem(`${CONTACTS_PREFIX}${myPeerId}`);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list.sort((a, b) => (b.lastMessageTime || b.addedAt || 0) - (a.lastMessageTime || a.addedAt || 0));
        }
      }
    } catch (e) {
      console.warn('Failed to load contacts:', e);
    }
    return [];
  }

  /**
   * Add or update a contact
   */
  saveContact(myPeerId, peerId, name = '') {
    if (!myPeerId || !peerId) return null;
    const cleanPeerId = peerId.trim().toLowerCase();
    const cleanName = name.trim() || cleanPeerId;

    const contacts = this.getContacts(myPeerId);
    const existingIndex = contacts.findIndex((c) => c.peerId.toLowerCase() === cleanPeerId);

    const now = Date.now();
    let contact;

    if (existingIndex >= 0) {
      // Update existing contact
      contact = {
        ...contacts[existingIndex],
        name: cleanName,
        updatedAt: now,
      };
      contacts[existingIndex] = contact;
    } else {
      // Add new contact
      contact = {
        peerId: cleanPeerId,
        name: cleanName,
        addedAt: now,
        lastMessage: 'Tap to start conversation',
        lastMessageTime: now,
      };
      contacts.unshift(contact);
    }

    try {
      localStorage.setItem(`${CONTACTS_PREFIX}${myPeerId}`, JSON.stringify(contacts));
    } catch (e) {
      console.warn('Failed to save contact:', e);
    }

    return contact;
  }

  /**
   * Delete a contact
   */
  deleteContact(myPeerId, peerId) {
    if (!myPeerId || !peerId) return [];
    const cleanTargetId = peerId.trim().toLowerCase();
    const contacts = this.getContacts(myPeerId).filter(
      (c) => c.peerId.toLowerCase() !== cleanTargetId
    );
    try {
      localStorage.setItem(`${CONTACTS_PREFIX}${myPeerId}`, JSON.stringify(contacts));
      // Also clean up stored chat messages for this peer
      const chatKey = `${CHAT_PREFIX}${myPeerId}_${cleanTargetId}`;
      localStorage.removeItem(chatKey);
    } catch (e) {
      console.warn('Failed to delete contact:', e);
    }
    return contacts;
  }

  /**
   * Update the latest message snippet and timestamp for a contact
   */
  updateLastMessage(myPeerId, peerId, text, timestamp = Date.now()) {
    if (!myPeerId || !peerId) return;
    const cleanPeerId = peerId.trim().toLowerCase();
    const contacts = this.getContacts(myPeerId);
    const index = contacts.findIndex((c) => c.peerId.toLowerCase() === cleanPeerId);

    if (index >= 0) {
      contacts[index].lastMessage = text || 'Media message';
      contacts[index].lastMessageTime = timestamp;
      try {
        localStorage.setItem(`${CONTACTS_PREFIX}${myPeerId}`, JSON.stringify(contacts));
      } catch (e) {}
    } else {
      // Auto-create contact if incoming from a new peer
      this.saveContact(myPeerId, cleanPeerId, cleanPeerId);
      this.updateLastMessage(myPeerId, cleanPeerId, text, timestamp);
    }
  }

  /**
   * Get chat messages history with a specific peer
   */
  getChatHistory(myPeerId, peerId) {
    if (!myPeerId || !peerId) return [];
    try {
      const key = `${CHAT_PREFIX}${myPeerId}_${peerId.trim().toLowerCase()}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {}
    return [];
  }

  /**
   * Append a chat message to history (limit to last 200 messages per peer for storage efficiency)
   */
  saveChatMessage(myPeerId, peerId, message) {
    if (!myPeerId || !peerId || !message) return;
    try {
      const key = `${CHAT_PREFIX}${myPeerId}_${peerId.trim().toLowerCase()}`;
      const history = this.getChatHistory(myPeerId, peerId);
      const updated = [...history, message].slice(-200);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {}
  }
}

export const contactService = new ContactService();
export default contactService;
