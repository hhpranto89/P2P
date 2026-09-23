/**
 * Nexus P2P Messenger - Storage & Download Controller
 * Supports Local File System Access API (Chrome), @capacitor/filesystem (Android),
 * and direct Google Drive API (OAuth 2.0).
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

const STORAGE_DESTINATION_KEY = 'nexus_storage_destination';
const GDRIVE_TOKEN_KEY = 'nexus_gdrive_token';
const GDRIVE_CLIENT_ID_KEY = 'nexus_gdrive_client_id';
const GDRIVE_USER_KEY = 'nexus_gdrive_user';

export class StorageService {
  constructor() {
    this.tokenClient = null;
    this.googleAccessToken = localStorage.getItem(GDRIVE_TOKEN_KEY) || null;
    this.googleUser = null;
    try {
      this.googleUser = JSON.parse(localStorage.getItem(GDRIVE_USER_KEY) || 'null');
    } catch (e) {}
  }

  getDestinationPreference() {
    return localStorage.getItem(STORAGE_DESTINATION_KEY) || 'ask'; // 'local' | 'drive' | 'ask'
  }

  setDestinationPreference(dest) {
    localStorage.setItem(STORAGE_DESTINATION_KEY, dest);
  }

  getGoogleClientId() {
    return localStorage.getItem(GDRIVE_CLIENT_ID_KEY) || '';
  }

  setGoogleClientId(clientId) {
    localStorage.setItem(GDRIVE_CLIENT_ID_KEY, clientId.trim());
  }

  getGoogleToken() {
    return this.googleAccessToken;
  }

  getGoogleUser() {
    return this.googleUser;
  }

  isGoogleConnected() {
    return !!this.googleAccessToken;
  }

  disconnectGoogle() {
    this.googleAccessToken = null;
    this.googleUser = null;
    localStorage.removeItem(GDRIVE_TOKEN_KEY);
    localStorage.removeItem(GDRIVE_USER_KEY);
  }

  /**
   * Initialize Google Identity Services token client
   */
  async initGoogleAuth(clientId) {
    const activeClientId = clientId || this.getGoogleClientId();
    if (!activeClientId) {
      throw new Error('Google OAuth Client ID is required.');
    }

    if (typeof window === 'undefined' || !window.google || !window.google.accounts) {
      throw new Error('Google Identity Services SDK is not loaded.');
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: activeClientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              reject(new Error(tokenResponse.error_description || tokenResponse.error));
              return;
            }

            this.googleAccessToken = tokenResponse.access_token;
            localStorage.setItem(GDRIVE_TOKEN_KEY, tokenResponse.access_token);

            // Fetch user profile info
            try {
              const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${this.googleAccessToken}` },
              });
              if (res.ok) {
                this.googleUser = await res.json();
                localStorage.setItem(GDRIVE_USER_KEY, JSON.stringify(this.googleUser));
              }
            } catch (err) {
              console.warn('Failed to fetch Google profile info:', err);
            }

            resolve({
              accessToken: this.googleAccessToken,
              user: this.googleUser,
            });
          },
        });

        // Trigger prompt popup
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Save file to Local Device Storage
   * Uses @capacitor/filesystem on Native Android
   * Uses File System Access API on Desktop Chrome
   * Falls back to standard HTML5 Blob Download
   */
  async saveToDevice(blob, fileName, mimeType) {
    const isNative = Capacitor.isNativePlatform();

    if (isNative) {
      // Native Android via @capacitor/filesystem
      const base64Data = await this.blobToBase64(blob);
      const cleanBase64 = base64Data.split(',')[1] || base64Data;

      try {
        const result = await Filesystem.writeFile({
          path: `Download/${fileName}`,
          data: cleanBase64,
          directory: Directory.Documents,
          recursive: true,
        });

        return {
          success: true,
          platform: 'android-capacitor',
          uri: result.uri,
          message: `Saved to Documents/Download/${fileName}`,
        };
      } catch (err) {
        // Fallback to cache directory if permission restricted
        const result = await Filesystem.writeFile({
          path: fileName,
          data: cleanBase64,
          directory: Directory.Cache,
        });

        return {
          success: true,
          platform: 'android-capacitor-cache',
          uri: result.uri,
          message: `Saved to local app cache: ${fileName}`,
        };
      }
    }

    // Chrome Browser: File System Access API (showSaveFilePicker)
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
        const pickerOptions = {
          suggestedName: fileName,
        };

        if (extension && mimeType) {
          pickerOptions.types = [
            {
              description: 'Original Media File',
              accept: {
                [mimeType]: [`.${extension}`],
              },
            },
          ];
        }

        // @ts-ignore
        const fileHandle = await window.showSaveFilePicker(pickerOptions);
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(blob);
        await writableStream.close();

        return {
          success: true,
          platform: 'chrome-fsa',
          fileName: fileHandle.name || fileName,
          message: `File saved successfully to local disk!`,
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, cancelled: true };
        }
        console.warn('File System Access API failed, falling back to standard download:', err);
      }
    }

    // Fallback: Standard HTML5 Blob download
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 1000);

    return {
      success: true,
      platform: 'browser-download',
      message: `Downloaded ${fileName} to Downloads folder`,
    };
  }

  /**
   * Upload file directly to user's personal Google Drive
   */
  async saveToGoogleDrive(blob, fileName, mimeType = 'application/octet-stream') {
    if (!this.googleAccessToken) {
      throw new Error('Google Drive account is not connected. Please connect in Settings.');
    }

    const metadata = {
      name: fileName,
      mimeType: mimeType,
      description: 'Transferred via Nexus P2P Messenger in 100% original quality',
    };

    const boundary = '-------NexusP2PBoundary' + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataPart =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata);

    const mediaHeader =
      delimiter +
      `Content-Type: ${mimeType}\r\n` +
      'Content-Transfer-Encoding: base64\r\n\r\n';

    const base64Data = await this.blobToBase64(blob);
    const cleanBase64 = base64Data.split(',')[1] || base64Data;

    const multipartRequestBody =
      metadataPart + mediaHeader + cleanBase64 + closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.googleAccessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      if (response.status === 401) {
        this.disconnectGoogle();
        throw new Error('Google Drive session expired. Please sign in again in Settings.');
      }
      throw new Error(errJson.error?.message || `Google Drive upload failed (${response.status})`);
    }

    const fileResult = await response.json();
    return {
      success: true,
      fileId: fileResult.id,
      name: fileResult.name,
      link: fileResult.webViewLink || `https://drive.google.com/file/d/${fileResult.id}/view`,
      message: `Uploaded to Google Drive!`,
    };
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const storageService = new StorageService();
export default storageService;
