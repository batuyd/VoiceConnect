import SimplePeer, { SignalData } from "simple-peer";

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;

  private async checkAudioPermissions(): Promise<boolean> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      if (audioDevices.length === 0) {
        throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
      }

      // Ses izinlerini kontrol et
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Test stream'i durdur
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      if (error instanceof Error) {
        if (error instanceof DOMException) {
          switch (error.name) {
            case 'NotAllowedError':
              throw new Error('Mikrofon izni reddedildi. Lütfen tarayıcı izinlerini kontrol edin.');
            case 'NotFoundError':
              throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
            case 'NotReadableError':
              throw new Error('Mikrofona erişilemiyor. Başka bir uygulama kullanıyor olabilir.');
            case 'PermissionDeniedError':
              throw new Error('Mikrofon izni reddedildi. Lütfen tarayıcı izinlerini kontrol edin.');
            default:
              throw new Error(`Ses cihazına erişilemiyor: ${error.message}`);
          }
        }
        throw error;
      }
      throw new Error('Ses izinleri kontrol edilirken beklenmeyen bir hata oluştu');
    }
  }

  async startLocalStream(audioConstraints: MediaTrackConstraints = {}) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Tarayıcınız WebRTC desteklemiyor');
      }

      // İzinleri kontrol et
      await this.checkAudioPermissions();

      // Eğer zaten bir stream varsa onu durduralım
      if (this.localStream) {
        await this.stopLocalStream();
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...audioConstraints
        },
        video: false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Ses cihazına erişilemedi:', error.message);
        throw error;
      }
      throw new Error('Beklenmeyen bir hata oluştu');
    }
  }

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
      });
      this.localStream = null;
    }
  }

  async initializePeerConnection(targetUserId: number, isInitiator: boolean = false) {
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

      const peerConnection: PeerConnection = {
        peer,
        stream: this.localStream
      };

      this.peers.set(targetUserId, peerConnection);

      // Handle incoming stream
      peer.on('stream', (remoteStream: MediaStream) => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => {
          if (e instanceof Error) {
            console.error('Ses oynatma hatası:', e.message);
          }
        });
      });

      // Handle error
      peer.on('error', (err: Error) => {
        console.error('Peer bağlantı hatası:', err.message);
        this.removePeer(targetUserId);
      });

      return peer;
    } catch (error) {
      if (error instanceof Error) {
        console.error('Peer bağlantısı başlatılamadı:', error.message);
        throw error;
      }
      throw new Error('Peer bağlantısı kurulurken beklenmeyen bir hata oluştu');
    }
  }

  async connectToPeer(targetUserId: number) {
    try {
      const peer = await this.initializePeerConnection(targetUserId, true);

      return new Promise<SignalData>((resolve, reject) => {
        peer.on('signal', (data: SignalData) => {
          resolve(data);
        });

        peer.on('error', (err: Error) => {
          reject(new Error('Peer bağlantı hatası: ' + err.message));
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('Peer\'e bağlanılamadı:', error.message);
        throw error;
      }
      throw new Error('Bağlantı kurulurken beklenmeyen bir hata oluştu');
    }
  }

  async acceptConnection(targetUserId: number, signalData: unknown) {
    try {
      if (typeof signalData !== 'string' && typeof signalData !== 'object') {
        throw new Error('Geçersiz sinyal verisi formatı');
      }

      const peer = await this.initializePeerConnection(targetUserId, false);
      peer.signal(signalData as SignalData);

      return new Promise<SignalData>((resolve, reject) => {
        peer.on('signal', (data: SignalData) => {
          resolve(data);
        });

        peer.on('error', (err: Error) => {
          reject(new Error('Bağlantı kabul hatası: ' + err.message));
        });
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('Bağlantı kabul edilemedi:', error.message);
        throw error;
      }
      throw new Error('Bağlantı kabul edilirken beklenmeyen bir hata oluştu');
    }
  }

  async handleAnswer(targetUserId: number, signalData: unknown) {
    try {
      if (typeof signalData !== 'string' && typeof signalData !== 'object') {
        throw new Error('Geçersiz sinyal verisi formatı');
      }

      const peerConnection = this.peers.get(targetUserId);
      if (peerConnection) {
        peerConnection.peer.signal(signalData as SignalData);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Yanıt işlenemedi:', error.message);
        throw error;
      }
      throw new Error('Yanıt işlenirken beklenmeyen bir hata oluştu');
    }
  }

  removePeer(targetUserId: number) {
    const peerConnection = this.peers.get(targetUserId);
    if (peerConnection) {
      peerConnection.peer.destroy();
      this.peers.delete(targetUserId);
    }
  }

  leaveRoom() {
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();
    this.stopLocalStream();
  }
}

export const webRTCService = new WebRTCService();