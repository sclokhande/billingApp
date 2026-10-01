/**
 * VoiceService provides native Speech-to-Text integration
 * for the Parchiwala offline AI Assistant using @react-native-voice/voice
 * with automatic permission requests, partial real-time streaming,
 * multilingual locale selection (Marathi, Hindi, English), and safe fallbacks.
 */

import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

export type VoiceLocale = 'mr-IN' | 'hi-IN' | 'en-IN';

export interface VoiceServiceListeners {
  onSpeechStart?: () => void;
  onSpeechRecognized?: (text: string) => void;
  onSpeechPartial?: (partialText: string) => void;
  onSpeechEnd?: () => void;
  onSpeechError?: (error: string) => void;
}

class VoiceService {
  private isListening: boolean = false;
  private listeners: VoiceServiceListeners = {};
  private currentLocale: VoiceLocale = 'mr-IN';
  private voiceInstance: any = null;

  constructor() {
    this.initNativeVoice();
  }

  private initNativeVoice() {
    try {
      console.log('[VoiceService] Platform:', Platform.OS);
      console.log('[VoiceService] NativeModules keys:', Object.keys(NativeModules || {}));
      console.log('[VoiceService] NativeModules.Voice:', NativeModules?.Voice);
      console.log('[VoiceService] NativeModules.RCTVoice:', NativeModules?.RCTVoice);
      if (NativeModules) {
        if (!NativeModules.Voice && NativeModules.RCTVoice) {
          NativeModules.Voice = NativeModules.RCTVoice;
        }
        if (NativeModules.Voice) {
          const Voice = require('@react-native-voice/voice').default;
          this.voiceInstance = Voice;

        this.voiceInstance.onSpeechStart = () => {
          this.isListening = true;
          if (this.listeners.onSpeechStart) {
            this.listeners.onSpeechStart();
          }
        };

        this.voiceInstance.onSpeechRecognized = () => {
          // Native speech recognition recognized speech audio
        };

        this.voiceInstance.onSpeechEnd = () => {
          this.isListening = false;
          if (this.listeners.onSpeechEnd) {
            this.listeners.onSpeechEnd();
          }
        };

        this.voiceInstance.onSpeechError = (e: any) => {
          this.isListening = false;
          const errorMsg =
            e?.error?.message ||
            (typeof e?.error === 'string' ? e.error : 'Speech recognition error');
          if (this.listeners.onSpeechError) {
            this.listeners.onSpeechError(errorMsg);
          }
        };

        this.voiceInstance.onSpeechResults = (e: any) => {
          this.isListening = false;
          const matches = e?.value;
          if (matches && matches.length > 0) {
            const spokenText = matches[0];
            if (this.listeners.onSpeechRecognized) {
              this.listeners.onSpeechRecognized(spokenText);
            }
          } else {
            if (this.listeners.onSpeechEnd) {
              this.listeners.onSpeechEnd();
            }
          }
        };

        this.voiceInstance.onSpeechPartialResults = (e: any) => {
          const matches = e?.value;
          if (matches && matches.length > 0) {
            const partialText = matches[0];
            if (this.listeners.onSpeechPartial) {
              this.listeners.onSpeechPartial(partialText);
            }
          }
        };
      }
    }
  } catch (err) {
    console.warn('VoiceService: Native voice module not initialized:', err);
    this.voiceInstance = null;
  }
  }

  public setListeners(listeners: VoiceServiceListeners) {
    this.listeners = listeners;
  }

  public setLocale(locale: VoiceLocale) {
    this.currentLocale = locale;
  }

  public getLocale(): VoiceLocale {
    return this.currentLocale;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public isNativeSupported(): boolean {
    return Boolean(NativeModules && (NativeModules.Voice || NativeModules.RCTVoice));
  }

  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message:
              'Parchiwala needs access to your microphone to listen to your voice billing orders.',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn('Error requesting audio permission:', err);
        return false;
      }
    }
    return true;
  }

  public async startListening(localeOverride?: VoiceLocale): Promise<boolean> {
    const locale = localeOverride || this.currentLocale;

    // Check permissions
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      if (this.listeners.onSpeechError) {
        this.listeners.onSpeechError(
          'Microphone permission was denied. Please enable it in device Settings.'
        );
      }
      return false;
    }

    if (!this.voiceInstance) {
      this.initNativeVoice();
    }

    if (!this.voiceInstance) {
      // Native module not linked in binary
      this.isListening = false;
      if (this.listeners.onSpeechError) {
        this.listeners.onSpeechError(
          'Native speech recognition is not linked in this app build. Please rebuild the app (npx react-native run-android / run-ios) with microphone permissions.'
        );
      }
      return false;
    }

    try {
      // Cancel any ongoing recognition before starting
      try {
        await this.voiceInstance.stop();
        await this.voiceInstance.destroy();
      } catch (_) {
        // ignore reset errors
      }

      this.isListening = true;
      if (this.listeners.onSpeechStart) {
        this.listeners.onSpeechStart();
      }

      await this.voiceInstance.start(locale);
      return true;
    } catch (err: any) {
      this.isListening = false;
      const msg = err?.message || 'Could not start voice recognition';
      if (this.listeners.onSpeechError) {
        this.listeners.onSpeechError(msg);
      }
      return false;
    }
  }

  public async stopListening(): Promise<void> {
    this.isListening = false;
    if (this.voiceInstance) {
      try {
        await this.voiceInstance.stop();
      } catch (_) {
        // ignore
      }
    }
    if (this.listeners.onSpeechEnd) {
      this.listeners.onSpeechEnd();
    }
  }

  public emitRecognizedSpeech(text: string): void {
    if (this.listeners.onSpeechRecognized) {
      this.listeners.onSpeechRecognized(text);
    }
    this.stopListening();
  }

  public async destroy(): Promise<void> {
    this.isListening = false;
    if (this.voiceInstance) {
      try {
        await this.voiceInstance.destroy();
        this.voiceInstance.removeAllListeners();
      } catch (_) {
        // ignore
      }
    }
    this.listeners = {};
  }
}

export const voiceService = new VoiceService();
