import SimplePeer from 'simple-peer';

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;

  async startLocalStream(audioConstraints: MediaTrackConstraints = {}) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('tarayıcınız WebRTC desteklemiyor');
      }

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
      console.error('Ses cihazına erişilemedi:', error);
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Mikrofon izni reddedildi. Lütfen tarayıcı izinlerini kontrol edin.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('Mikrofon cihazı bulunamadı. Lütfen bir mikrofon bağlayın.');
        }
      }
      throw new Error('Ses cihazına bağlanırken bir hata oluştu: ' + error.message);
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
        audio.play().catch(console.error);
      });

      // Handle error
      peer.on('error', (err) => {
        console.error('Peer bağlantı hatası:', err);
        this.removePeer(targetUserId);
      });

      return peer;
    } catch (error) {
      console.error('Peer bağlantısı başlatılamadı:', error);
      throw error;
    }
  }

  async connectToPeer(targetUserId: number) {
    try {
      const peer = await this.initializePeerConnection(targetUserId, true);

      return new Promise((resolve, reject) => {
        peer.on('signal', data => {
          resolve(data);
        });

        peer.on('error', reject);
      });
    } catch (error) {
      console.error('Peer\'e bağlanılamadı:', error);
      throw error;
    }
  }

  async acceptConnection(targetUserId: number, signalData: any) {
    try {
      const peer = await this.initializePeerConnection(targetUserId, false);
      peer.signal(signalData);

      return new Promise((resolve, reject) => {
        peer.on('signal', data => {
          resolve(data);
        });

        peer.on('error', reject);
      });
    } catch (error) {
      console.error('Bağlantı kabul edilemedi:', error);
      throw error;
    }
  }

  async handleAnswer(targetUserId: number, signalData: any) {
    try {
      const peerConnection = this.peers.get(targetUserId);
      if (peerConnection) {
        peerConnection.peer.signal(signalData);
      }
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