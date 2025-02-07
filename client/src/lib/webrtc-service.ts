// @ts-nocheck - disable TypeScript checks for global polyfill
import SimplePeer from 'simple-peer';

// Polyfill for SimplePeer
if (typeof window !== 'undefined') {
  (window as any).global = window;
}

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

class WebRTCService {
  private peers: Map<number, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;

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

  async initializePeerConnection(targetUserId: number, isInitiator: boolean = false) {
    if (!this.localStream) {
      throw new Error('Local stream not initialized');
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
      console.error('Peer connection error:', err);
      this.removePeer(targetUserId);
    });

    return peer;
  }

  async connectToPeer(targetUserId: number) {
    const peer = await this.initializePeerConnection(targetUserId, true);

    return new Promise((resolve, reject) => {
      peer.on('signal', data => {
        // Return the offer to be sent to the target peer
        resolve(data);
      });

      peer.on('error', reject);
    });
  }

  async acceptConnection(targetUserId: number, signalData: any) {
    const peer = await this.initializePeerConnection(targetUserId, false);
    peer.signal(signalData);

    return new Promise((resolve, reject) => {
      peer.on('signal', data => {
        // Return the answer to be sent to the initiating peer
        resolve(data);
      });

      peer.on('error', reject);
    });
  }

  async handleAnswer(targetUserId: number, signalData: any) {
    const peerConnection = this.peers.get(targetUserId);
    if (peerConnection) {
      peerConnection.peer.signal(signalData);
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
    // Close all peer connections
    this.peers.forEach(({ peer }) => {
      peer.destroy();
    });
    this.peers.clear();

    // Stop local stream
    this.stopLocalStream();
  }
}

export const webRTCService = new WebRTCService();