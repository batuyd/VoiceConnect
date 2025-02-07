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
  private retryAttempts: number = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor() {
    this.mediaDevicesSupported = typeof window !== 'undefined' &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;
    this.audioContext = null;
    this.retryAttempts = 0;

    // Sayfa görünürlük değişikliğini dinle
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden && this.localStream) {
      this.stopLocalStream();
    } else if (!document.hidden && !this.localStream) {
      this.startLocalStream().catch(console.error);
    }
  };

  private async checkBrowserSupport(): Promise<void> {
    if (typeof window === 'undefined' || !window.navigator) {
      throw new Error('Bu özellik sadece web tarayıcısında kullanılabilir.');
    }

    if (!this.mediaDevicesSupported) {
      throw new Error('Tarayıcınız WebRTC desteklemiyor. Lütfen modern bir tarayıcı kullanın.');
    }

    if (!window.RTCPeerConnection) {
      throw new Error('Tarayıcınız RTCPeerConnection desteklemiyor.');
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Tarayıcınız ses cihazlarına erişim desteklemiyor.');
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioDevices.length === 0) {
        throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
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
        console.log('🔈 Ses sistemi askıya alınmış, devam ettiriliyor...');
        await this.audioContext.resume();
      }

      return this.audioContext;
    } catch (error) {
      console.error('❌ Ses sistemi başlatma hatası:', error);
      throw new Error('Ses sistemi başlatılamadı. Tarayıcı ayarlarınızı kontrol edin ve sayfayı yenileyin.');
    }
  }

  private async requestPermissionsWithRetry(): Promise<MediaStream> {
    for (let attempt = 0; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        // Önce izinleri kontrol et
        const permissions = await navigator.permissions.query({ name: 'microphone' as PermissionName });

        if (permissions.state === 'denied') {
          throw new Error('Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.');
        }

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
          throw new Error('Ses akışı başlatılamadı.');
        }

        // Ses seviyesini kontrol et
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        console.log('✅ Mikrofon erişimi ve ses akışı başarılı');
        this.retryAttempts = 0;
        return stream;
      } catch (error: any) {
        console.error(`❌ Mikrofon erişim denemesi ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS + 1} başarısız:`, error);

        if (attempt === this.MAX_RETRY_ATTEMPTS) {
          throw this.createUserFriendlyError(error);
        }

        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ ${delay/1000} saniye sonra tekrar denenecek...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Mikrofon erişimi sağlanamadı.');
  }

  private createUserFriendlyError(error: any): Error {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return new Error('Mikrofon izni reddedildi. Lütfen tarayıcı ayarlarından mikrofon iznini kontrol edin.');
        case 'NotFoundError':
          return new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın ve sayfayı yenileyin.');
        case 'NotReadableError':
          return new Error('Mikrofonunuza erişilemiyor. Başka bir uygulama kullanıyor olabilir.');
        case 'OverconstrainedError':
          return new Error('Mikrofon ayarları uyumsuz. Lütfen farklı bir mikrofon deneyin.');
        case 'SecurityError':
          return new Error('Güvenlik hatası: HTTPS bağlantısı gerekiyor.');
        case 'AbortError':
          return new Error('Mikrofon erişimi iptal edildi. Lütfen tekrar deneyin.');
        default:
          return new Error(`Beklenmeyen bir hata oluştu: ${error.message}`);
      }
    }
    return error;
  }

  async startLocalStream(): Promise<MediaStream> {
    try {
      await this.checkBrowserSupport();

      if (this.localStream?.active) {
        console.log('ℹ️ Aktif ses akışı zaten var, mevcut akış kullanılıyor');
        return this.localStream;
      }

      if (this.localStream) {
        this.stopLocalStream();
      }

      this.localStream = await this.requestPermissionsWithRetry();
      const audioContext = await this.initializeAudioContext();

      // Ses kalitesini analiz et
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(this.localStream);
      source.connect(analyser);

      analyser.fftSize = 2048;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Ses seviyesini kontrol et
      analyser.getByteTimeDomainData(dataArray);
      const silent = dataArray.every(value => value === 128);

      if (silent) {
        console.warn('⚠️ Ses sinyali alınamıyor, mikrofon sessiz olabilir');
      }

      console.log('✅ Ses akışı başarıyla başlatıldı');
      return this.localStream;
    } catch (error) {
      const friendlyError = this.createUserFriendlyError(error);
      console.error('❌ Ses cihazı hatası:', friendlyError.message);
      throw friendlyError;
    }
  }

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log(`🛑 ${track.kind} akışı durduruldu`);
      });
      this.localStream = null;
    }

    if (this.audioContext) {
      try {
        await this.audioContext.close();
        this.audioContext = null;
        console.log('🛑 Ses sistemi kapatıldı');
      } catch (error) {
        console.error('❌ Ses sistemi kapatılırken hata:', error);
      }
    }
  }

  // Component unmount olduğunda çağrılmalı
  cleanup() {
    this.stopLocalStream();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
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

      console.log(`🔄 Peer bağlantısı başlatılıyor... (${isInitiator ? 'initiator' : 'receiver'})`);

      const peerConnection: PeerConnection = {
        peer,
        stream: this.localStream
      };

      this.peers.set(targetUserId, peerConnection);

      peer.on('stream', (remoteStream: MediaStream) => {
        try {
          console.log('📡 Uzak ses akışı alındı');
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.autoplay = true;

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              console.error('Ses oynatma hatası:', e);
              if (e.name === 'NotAllowedError') {
                console.log('Ses oynatmak için kullanıcı etkileşimi gerekiyor');
              }
            });
          }
        } catch (error) {
          console.error('Uzak ses akışı başlatılırken hata:', error);
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Peer bağlantı hatası:', err);
        this.removePeer(targetUserId);
      });

      return peer;
    } catch (error) {
      console.error('Peer bağlantısı başlatılamadı:', error);
      throw error;
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
      console.error('Peer\'e bağlanılamadı:', error);
      throw error;
    }
  }

  async handleAnswer(targetUserId: number, signalData: SignalData): Promise<void> {
    try {
      const peerConnection = this.peers.get(targetUserId);
      if (!peerConnection) {
        throw new Error('Peer bağlantısı bulunamadı');
      }

      console.log('📥 Yanıt sinyali alındı:', signalData.type);
      peerConnection.peer.signal(signalData);
    } catch (error) {
      console.error('Yanıt işlenemedi:', error);
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
    console.log('👋 Odadan çıkıldı');
  }
}

export const webRTCService = new WebRTCService();