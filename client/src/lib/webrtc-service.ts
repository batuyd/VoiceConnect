import SimplePeer, { SignalData } from "simple-peer";

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private mediaDevicesSupported: boolean;

  constructor() {
    // Browser desteğini kontrol et
    this.mediaDevicesSupported = typeof window !== 'undefined' && 
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia;
  }

  private async initializeAudioContext(): Promise<AudioContext> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    return audioContext;
  }

  private async checkBrowserSupport(): Promise<void> {
    if (!window || !navigator) {
      throw new Error('Bu özellik sadece web tarayıcısında kullanılabilir.');
    }

    if (!this.mediaDevicesSupported) {
      throw new Error('Tarayıcınız WebRTC desteklemiyor. Lütfen modern bir tarayıcı kullanın.');
    }

    // WebRTC API'lerinin varlığını kontrol et
    if (!window.RTCPeerConnection) {
      throw new Error('Tarayıcınız RTCPeerConnection desteklemiyor.');
    }

    try {
      await this.initializeAudioContext();
    } catch (error) {
      throw new Error('Ses sistemi başlatılamadı: ' + error.message);
    }
  }

  private async checkAudioPermissions(): Promise<boolean> {
    try {
      await this.checkBrowserSupport();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioDevices.length === 0) {
        throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
      }

      // Test stream oluştur
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Test stream'i durdur
      stream.getTracks().forEach(track => track.stop());
      console.log('✅ Mikrofon izinleri kontrol edildi');
      return true;
    } catch (error) {
      console.error('❌ Ses izinleri kontrol hatası:', error);

      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            throw new Error('Mikrofon izni reddedildi. Lütfen tarayıcı izinlerini kontrol edin.');
          case 'NotFoundError':
            throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
          case 'NotReadableError':
            throw new Error('Mikrofona erişilemiyor. Başka bir uygulama kullanıyor olabilir.');
          default:
            throw new Error(`Ses cihazına erişilemiyor: ${error.message}`);
        }
      }

      throw new Error('Ses izinleri kontrol edilirken beklenmeyen bir hata oluştu');
    }
  }

  async startLocalStream(audioConstraints: MediaTrackConstraints = {}): Promise<MediaStream> {
    try {
      // Browser desteğini ve izinleri kontrol et
      await this.checkBrowserSupport();
      await this.checkAudioPermissions();

      // Eğer zaten bir stream varsa onu durdur
      if (this.localStream) {
        this.stopLocalStream();
      }

      // Ses ayarlarını yapılandır
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...audioConstraints
        }
      };

      // Stream'i başlat
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Stream'in aktif olduğunu kontrol et
      if (!this.localStream.active) {
        throw new Error('Ses akışı başlatılamadı');
      }

      // Ses seviyesini kontrol et
      const audioContext = await this.initializeAudioContext();
      const source = audioContext.createMediaStreamSource(this.localStream);
      const analyzer = audioContext.createAnalyser();
      source.connect(analyzer);

      console.log('🎤 Ses akışı başarıyla başlatıldı');
      return this.localStream;
    } catch (error) {
      console.error('❌ Ses cihazına erişilemedi:', error);
      throw error;
    }
  }

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
      console.log('🛑 Ses akışı durduruldu');
    }
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

      // Handle incoming stream
      peer.on('stream', (remoteStream: MediaStream) => {
        try {
          console.log('📡 Uzak ses akışı alındı');
          const audio = new Audio();
          audio.srcObject = remoteStream;

          // Ses oynatmayı başlat
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(e => {
              console.error('Ses oynatma hatası:', e);
              // Kullanıcı etkileşimi gerekiyorsa bildir
              if (e.name === 'NotAllowedError') {
                console.log('Ses oynatmak için kullanıcı etkileşimi gerekiyor');
              }
            });
          }
        } catch (error) {
          console.error('Uzak ses akışı başlatılırken hata:', error);
        }
      });

      // Handle error
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

  async acceptConnection(targetUserId: number, signalData: SignalData): Promise<SignalData> {
    try {
      const peer = await this.initializePeerConnection(targetUserId, false);
      console.log('📥 Sinyal alındı:', signalData.type);
      peer.signal(signalData);

      return new Promise<SignalData>((resolve, reject) => {
        peer.on('signal', (data: SignalData) => {
          console.log('📤 Yanıt sinyali gönderiliyor:', data.type);
          resolve(data);
        });

        peer.on('error', (err: Error) => {
          console.error('Bağlantı kabul hatası:', err);
          reject(err);
        });
      });
    } catch (error) {
      console.error('Bağlantı kabul edilemedi:', error);
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