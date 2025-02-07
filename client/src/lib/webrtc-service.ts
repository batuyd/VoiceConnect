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
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  constructor() {
    this.mediaDevicesSupported = typeof window !== 'undefined' &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;

    this.setupDeviceChangeListeners();
  }

  private setupDeviceChangeListeners() {
    if (typeof window !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        console.log('🎤 Audio devices changed, checking available devices...');
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioDevices = devices.filter(device => device.kind === 'audioinput');
          console.log('📱 Available audio devices:', audioDevices.length);

          if (this.localStream && audioDevices.length === 0) {
            console.warn('⚠️ No audio devices available, stopping local stream');
            this.stopLocalStream();
          } else if (!this.localStream && audioDevices.length > 0) {
            console.log('🔄 Audio device available, attempting to restart stream');
            this.startLocalStream();
          }
        } catch (error) {
          console.error('❌ Error handling device change:', error);
        }
      });
    }
  }

  private async checkPermissions(): Promise<void> {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.permissionGranted = result.state === 'granted';

      result.addEventListener('change', () => {
        this.permissionGranted = result.state === 'granted';
        console.log('🎤 Microphone permission status changed:', result.state);
      });

      if (result.state === 'denied') {
        throw new Error('Mikrofon erişimi engellendi. Lütfen tarayıcı ayarlarından mikrofon erişimine izin verin.');
      }
    } catch (error) {
      console.warn('⚠️ Permission check failed:', error);
      // Continue anyway as some browsers don't support the permissions API
    }
  }

  private async checkBrowserSupport(): Promise<void> {
    if (typeof window === 'undefined' || !window.navigator) {
      throw new Error('Bu özellik sadece web tarayıcısında kullanılabilir.');
    }

    if (!this.mediaDevicesSupported) {
      throw new Error('Tarayıcınız WebRTC desteklemiyor. Lütfen modern bir tarayıcı kullanın.');
    }

    try {
      await this.checkPermissions();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioDevices.length === 0) {
        throw new Error('Mikrofon bulunamadı. Lütfen bir mikrofon bağlayın.');
      }

      console.log('✅ Tarayıcı ve donanım kontrolleri başarılı');
      console.log('📱 Bulunan ses cihazları:', audioDevices.map(d => d.label || 'İsimsiz Cihaz'));
    } catch (error) {
      console.error('❌ Donanım kontrol hatası:', error);
      throw this.createUserFriendlyError(error);
    }
  }

  private async initializeAudioContext(): Promise<AudioContext> {
    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || ((window as any).webkitAudioContext);
        if (!AudioContextClass) {
          throw new Error('Ses sistemi (AudioContext) tarayıcınız tarafından desteklenmiyor.');
        }
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('🎵 Audio context resumed successfully');
      }

      return this.audioContext;
    } catch (error) {
      console.error('❌ Ses sistemi başlatma hatası:', error);
      throw new Error('Ses sistemi başlatılamadı. Lütfen tarayıcı ayarlarınızı kontrol edin ve sayfayı yenileyin.');
    }
  }

  private createUserFriendlyError(error: any): Error {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error('Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarınızı kontrol edin ve tekrar deneyin.');
        case 'NotFoundError':
          return new Error('Mikrofon bulunamadı. Lütfen bir mikrofon bağlayın ve yenileyin.');
        case 'NotReadableError':
          return new Error('Mikrofonunuza erişilemiyor. Başka bir uygulama tarafından kullanılıyor olabilir.');
        case 'OverconstrainedError':
          return new Error('Mikrofon ayarları uyumsuz. Lütfen farklı bir mikrofon deneyin.');
        case 'SecurityError':
          return new Error('Güvenlik hatası: HTTPS bağlantısı gerekli.');
        case 'AbortError':
          return new Error('Mikrofon erişimi iptal edildi. Lütfen tekrar deneyin.');
        default:
          return new Error(`Beklenmedik hata: ${error.message}`);
      }
    }
    return error;
  }

  async startLocalStream(retry: boolean = true): Promise<MediaStream> {
    try {
      await this.checkBrowserSupport();

      // Check existing stream
      if (this.localStream?.active) {
        console.log('ℹ️ Aktif ses akışı mevcut, mevcut akış kullanılıyor');
        return this.localStream;
      }

      // Cleanup existing stream if inactive
      if (this.localStream) {
        this.stopLocalStream();
      }

      // Request permissions first
      await this.checkPermissions();

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        }
      };

      console.log('🎤 Attempting to get user media with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (!stream.active) {
        throw new Error('Ses akışı başlatılamadı.');
      }

      this.localStream = stream;
      await this.initializeAudioContext();

      // Set up audio track ended event handler with auto-recovery
      stream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('🎤 Ses akışı sonlandı, yeniden başlatılıyor...');
          if (retry) {
            this.reconnectAttempts = 0;
            this.attemptReconnect();
          }
        });

        // Monitor track muted state
        track.addEventListener('mute', () => {
          console.log('🎤 Ses akışı sessizleştirildi');
        });

        track.addEventListener('unmute', () => {
          console.log('🎤 Ses akışı açıldı');
        });
      });

      console.log('✅ Ses akışı başarıyla başlatıldı');
      this.reconnectAttempts = 0;
      return stream;
    } catch (error) {
      console.error('❌ Ses cihazı hatası:', error);
      throw this.createUserFriendlyError(error);
    }
  }

  private async attemptReconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('❌ Maksimum yeniden bağlanma denemesi aşıldı');
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Yeniden bağlanma denemesi ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);

    try {
      await this.startLocalStream(false);
      console.log('✅ Yeniden bağlanma başarılı');
    } catch (error) {
      console.error('❌ Yeniden bağlanma hatası:', error);
      setTimeout(() => this.attemptReconnect(), 2000 * this.reconnectAttempts);
    }
  }

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('🛑 Ses akışı durduruldu:', track.label);
      });
      this.localStream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
        this.audioContext = null;
        console.log('🔇 Ses sistemi kapatıldı');
      } catch (error) {
        console.error('❌ Ses sistemi kapatma hatası:', error);
      }
    }
  }

  cleanup() {
    this.stopLocalStream();
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();
    console.log('🧹 WebRTC servisi temizlendi');
  }

  async initializePeerConnection(targetUserId: number, isInitiator: boolean = false): Promise<SimplePeer.Instance> {
    try {
      if (!this.localStream) {
        await this.startLocalStream();
      }

      if (!this.localStream) {
        throw new Error('Ses akışı başlatılamadı');
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

      console.log(`🔄 Peer bağlantısı başlatılıyor... (${isInitiator ? 'başlatıcı' : 'alıcı'})`);

      peer.on('error', (err: Error) => {
        console.error('Peer bağlantı hatası:', err);
        this.handlePeerError(targetUserId, err);
      });

      peer.on('connect', () => {
        console.log('✅ Peer bağlantısı kuruldu');
      });

      peer.on('close', () => {
        console.log('❌ Peer bağlantısı kapandı');
        this.removePeer(targetUserId);
      });

      const peerConnection: PeerConnection = {
        peer,
        stream: this.localStream
      };

      this.peers.set(targetUserId, peerConnection);

      // Set up stream handling
      peer.on('stream', this.handleRemoteStream.bind(this));

      return peer;
    } catch (error) {
      console.error('Peer bağlantısı başlatma hatası:', error);
      throw error;
    }
  }

  private handlePeerError(targetUserId: number, error: Error) {
    console.error(`Peer ${targetUserId} bağlantı hatası:`, error);
    this.removePeer(targetUserId);

    // Attempt to reconnect if it's a network-related error
    if (error.message.includes('network') || error.message.includes('connect')) {
      setTimeout(() => {
        console.log(`🔄 Peer ${targetUserId} için yeniden bağlantı deneniyor...`);
        this.initializePeerConnection(targetUserId, true)
          .catch(e => console.error('Yeniden bağlantı hatası:', e));
      }, 2000);
    }
  }

  private handleRemoteStream(remoteStream: MediaStream) {
    try {
      console.log('📡 Uzak ses akışı alındı');
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;

      audio.addEventListener('playing', () => {
        console.log('▶️ Uzak ses akışı başladı');
      });

      audio.addEventListener('pause', () => {
        console.log('⏸️ Uzak ses akışı duraklatıldı');
      });

      audio.addEventListener('ended', () => {
        console.log('⏹️ Uzak ses akışı sonlandı');
      });

      audio.play().catch(e => {
        console.error('Ses çalma hatası:', e);
        if (e.name === 'NotAllowedError') {
          console.log('Ses çalmak için kullanıcı etkileşimi gerekli');
        }
      });
    } catch (error) {
      console.error('Uzak ses akışı başlatma hatası:', error);
    }
  }

  async connectToPeer(targetUserId: number): Promise<SignalData> {
    try {
      const peer = await this.initializePeerConnection(targetUserId, true);

      return new Promise<SignalData>((resolve, reject) => {
        peer.on('signal', (data: SignalData) => {
          console.log('📤 Sinyal gönderiliyor:', data.type);
          resolve(data);
        });

        peer.on('error', (err: Error) => {
          console.error('Peer bağlantı hatası:', err);
          reject(err);
        });
      });
    } catch (error) {
      console.error('Peer\'e bağlanma hatası:', error);
      throw error;
    }
  }

  async handleAnswer(targetUserId: number, signalData: SignalData): Promise<void> {
    try {
      const peerConnection = this.peers.get(targetUserId);
      if (!peerConnection) {
        throw new Error('Peer bağlantısı bulunamadı');
      }

      console.log('📥 Cevap sinyali alındı:', signalData.type);
      peerConnection.peer.signal(signalData);
    } catch (error) {
      console.error('Cevap işleme hatası:', error);
      throw error;
    }
  }

  removePeer(targetUserId: number) {
    const peerConnection = this.peers.get(targetUserId);
    if (peerConnection) {
      peerConnection.peer.destroy();
      this.peers.delete(targetUserId);
      console.log('❌ Peer bağlantısı kaldırıldı:', targetUserId);
    }
  }

  leaveRoom() {
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();
    this.stopLocalStream();
    console.log('👋 Odadan ayrıldı');
  }
}

export const webRTCService = new WebRTCService();