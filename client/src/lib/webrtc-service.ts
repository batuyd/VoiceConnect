import SimplePeer, { SignalData } from "simple-peer";

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private mediaDevicesSupported: boolean;
  private audioContext: AudioContext | null = null;
  private permissionGranted: boolean = false;

  constructor() {
    this.mediaDevicesSupported = typeof window !== 'undefined' &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;
  }

  private async checkPermissions(): Promise<void> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.permissionGranted = result.state === 'granted';

      result.addEventListener('change', () => {
        this.permissionGranted = result.state === 'granted';
      });

      if (result.state === 'denied') {
        throw new Error('Microphone access is blocked. Please allow microphone access in your browser settings.');
      }
    } catch (error) {
      console.warn('Permission check failed:', error);
      // Continue anyway as some browsers don't support the permissions API
    }
  }

  private async checkBrowserSupport(): Promise<void> {
    if (typeof window === 'undefined' || !window.navigator) {
      throw new Error('This feature is only available in a web browser.');
    }

    if (!this.mediaDevicesSupported) {
      throw new Error('Your browser does not support WebRTC. Please use a modern browser.');
    }

    try {
      await this.checkPermissions();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioDevices.length === 0) {
        throw new Error('No microphone found. Please connect a microphone.');
      }

      console.log('✅ Browser and hardware checks passed');
      console.log('📱 Found audio devices:', audioDevices.map(d => d.label || 'Unnamed Device'));
    } catch (error) {
      console.error('❌ Hardware check error:', error);
      throw this.createUserFriendlyError(error);
    }
  }

  private async initializeAudioContext(): Promise<AudioContext> {
    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || ((window as any).webkitAudioContext);
        if (!AudioContextClass) {
          throw new Error('Audio system (AudioContext) is not supported by your browser.');
        }
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      return this.audioContext;
    } catch (error) {
      console.error('❌ Audio system initialization error:', error);
      throw new Error('Failed to initialize audio system. Please check your browser settings and refresh the page.');
    }
  }

  private createUserFriendlyError(error: any): Error {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error('Microphone permission denied. Please check your browser settings and try again.');
        case 'NotFoundError':
          return new Error('No microphone found. Please connect a microphone and refresh.');
        case 'NotReadableError':
          return new Error('Cannot access your microphone. It might be in use by another application.');
        case 'OverconstrainedError':
          return new Error('Microphone settings are incompatible. Please try a different microphone.');
        case 'SecurityError':
          return new Error('Security error: HTTPS connection required.');
        case 'AbortError':
          return new Error('Microphone access was aborted. Please try again.');
        default:
          return new Error(`Unexpected error: ${error.message}`);
      }
    }
    return error;
  }

  async startLocalStream(retry: boolean = true): Promise<MediaStream> {
    try {
      await this.checkBrowserSupport();

    // Check existing stream
    if (this.localStream?.active) {
      console.log('ℹ️ Active audio stream exists, using current stream');
      return this.localStream;
    }

    // Cleanup existing stream if inactive
    if (this.localStream) {
      this.stopLocalStream();
    }

    // Request permissions first
    await this.checkPermissions();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      }
    });

    if (!stream.active) {
      throw new Error('Failed to start audio stream.');
    }

    this.localStream = stream;
    await this.initializeAudioContext();

    // Set up audio track ended event handler with auto-recovery
    stream.getAudioTracks().forEach(track => {
      track.addEventListener('ended', () => {
        console.log('🎤 Audio track ended, attempting to restart...');
        if (retry) {
          setTimeout(() => {
            this.startLocalStream(false).catch(console.error);
          }, 1000);
        }
      });

      // Monitor track muted state
      track.addEventListener('mute', () => {
        console.log('🎤 Audio track muted');
      });

      track.addEventListener('unmute', () => {
        console.log('🎤 Audio track unmuted');
      });
    });

    console.log('✅ Audio stream successfully started');
    return stream;
  } catch (error) {
    console.error('❌ Audio device error:', error);
    throw this.createUserFriendlyError(error);
  }
}

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
        this.audioContext = null;
      } catch (error) {
        console.error('❌ Error closing audio system:', error);
      }
    }
  }

  cleanup() {
    this.stopLocalStream();
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();
  }

  async initializePeerConnection(targetUserId: number, isInitiator: boolean = false): Promise<SimplePeer.Instance> {
    try {
      if (!this.localStream) {
        await this.startLocalStream();
      }

      if (!this.localStream) {
        throw new Error('Failed to start audio stream');
      }

      const peer = new SimplePeer({
        initiator: isInitiator,
        stream: this.localStream,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      console.log(`🔄 Initializing peer connection... (${isInitiator ? 'initiator' : 'receiver'})`);

      const peerConnection: PeerConnection = {
        peer,
        stream: this.localStream
      };

      this.peers.set(targetUserId, peerConnection);

      peer.on('stream', (remoteStream: MediaStream) => {
        try {
          console.log('📡 Remote audio stream received');
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.autoplay = true;

          audio.play().catch(e => {
            console.error('Audio playback error:', e);
            if (e.name === 'NotAllowedError') {
              console.log('User interaction required to play audio');
            }
          });
        } catch (error) {
          console.error('Error starting remote audio stream:', error);
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Peer connection error:', err);
        this.removePeer(targetUserId);
      });

      return peer;
    } catch (error) {
      console.error('Failed to initialize peer connection:', error);
      throw error;
    }
  }

  async connectToPeer(targetUserId: number): Promise<SignalData> {
    try {
      const peer = await this.initializePeerConnection(targetUserId, true);

      return new Promise<SignalData>((resolve, reject) => {
        peer.on('signal', (data: SignalData) => {
          console.log('📤 Sending signal:', data.type);
          resolve(data);
        });

        peer.on('error', (err: Error) => {
          console.error('Peer connection error:', err);
          reject(err);
        });
      });
    } catch (error) {
      console.error('Failed to connect to peer:', error);
      throw error;
    }
  }

  async handleAnswer(targetUserId: number, signalData: SignalData): Promise<void> {
    try {
      const peerConnection = this.peers.get(targetUserId);
      if (!peerConnection) {
        throw new Error('Peer connection not found');
      }

      console.log('📥 Received answer signal:', signalData.type);
      peerConnection.peer.signal(signalData);
    } catch (error) {
      console.error('Failed to handle answer:', error);
      throw error;
    }
  }

  removePeer(targetUserId: number) {
    const peerConnection = this.peers.get(targetUserId);
    if (peerConnection) {
      peerConnection.peer.destroy();
      this.peers.delete(targetUserId);
      console.log('❌ Peer connection removed:', targetUserId);
    }
  }

  leaveRoom() {
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();
    this.stopLocalStream();
    console.log('👋 Left room');
  }
}

export const webRTCService = new WebRTCService();