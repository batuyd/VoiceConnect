import SimplePeer from 'simple-peer';

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private ws: WebSocket | null = null;

  constructor() {
    this.setupWebSocket();
  }

  private setupWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'offer':
          await this.handleOffer(data);
          break;
        case 'answer':
          await this.handleAnswer(data);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(data);
          break;
      }
    };
  }

  async startLocalStream(audioConstraints: MediaTrackConstraints = {}) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });
      return this.localStream;
    } catch (error) {
      console.error('Failed to get local stream:', error);
      throw error;
    }
  }

  async stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }

  async joinRoom(channelId: number, userId: number) {
    if (!this.localStream) {
      throw new Error('Local stream not initialized');
    }

    // Announce joining to the server
    this.ws?.send(JSON.stringify({
      type: 'join_room',
      channelId,
      userId
    }));
  }

  private async handleOffer({ from, offer }: { from: number, offer: any }) {
    if (!this.localStream) return;

    const peer = new SimplePeer({
      initiator: false,
      stream: this.localStream,
      trickle: true
    });

    peer.on('signal', data => {
      this.ws?.send(JSON.stringify({
        type: 'answer',
        to: from,
        answer: data
      }));
    });

    peer.on('stream', (remoteStream: MediaStream) => {
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.play();
    });

    this.peers.set(from, { peer, stream: this.localStream });
    peer.signal(offer);
  }

  private async handleAnswer({ from, answer }: { from: number, answer: any }) {
    const peerConnection = this.peers.get(from);
    if (peerConnection) {
      peerConnection.peer.signal(answer);
    }
  }

  private handleIceCandidate({ from, candidate }: { from: number, candidate: any }) {
    const peerConnection = this.peers.get(from);
    if (peerConnection) {
      peerConnection.peer.signal({ candidate });
    }
  }

  leaveRoom() {
    // Close all peer connections
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();

    // Stop local stream
    this.stopLocalStream();

    // Close WebSocket connection
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

export const webRTCService = new WebRTCService();
