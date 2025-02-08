import { useState, useEffect, useCallback, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { useAudioSettings } from './use-audio-settings';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

// Polyfill global for simple-peer
if (typeof window !== 'undefined') {
  (window as any).global = window;
}

interface PeerConnection {
  peer: SimplePeer.Instance;
  stream: MediaStream;
}

export function useWebRTC(channelId: number) {
  const { selectedInputDevice } = useAudioSettings();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Record<number, PeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const createPeer = useCallback(async (targetUserId: number, initiator: boolean) => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        localStreamRef.current = stream;
      }

      const peer = new SimplePeer({
        initiator,
        stream: localStreamRef.current,
        trickle: false,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      peer.on('signal', async (data) => {
        try {
          const response = await fetch(`/api/channels/${channelId}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId, signal: data })
          });

          if (!response.ok) {
            throw new Error('Failed to send signal');
          }
        } catch (error) {
          console.error('Signaling error:', error);
          cleanupPeer(targetUserId);
        }
      });

      peer.on('connect', () => {
        console.log('Peer connected');
        setIsConnected(true);
      });

      peer.on('stream', (remoteStream) => {
        console.log('Received remote stream');
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.play().catch(console.error);
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        cleanupPeer(targetUserId);
      });

      peer.on('close', () => {
        console.log('Peer connection closed');
        cleanupPeer(targetUserId);
      });

      setPeers(prev => ({
        ...prev,
        [targetUserId]: { peer, stream: localStreamRef.current! }
      }));

      return peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      toast({
        description: t('voice.peerConnectionError'),
        variant: "destructive",
      });
      return null;
    }
  }, [channelId, selectedInputDevice, toast, t]);

  const handleIncomingSignal = useCallback(async (userId: number, signal: SimplePeer.SignalData) => {
    try {
      let peer = peers[userId]?.peer;

      if (!peer) {
        peer = await createPeer(userId, false);
        if (!peer) return;
      }

      peer.signal(signal);
    } catch (error) {
      console.error('Error handling incoming signal:', error);
    }
  }, [peers, createPeer]);

  const cleanupPeer = useCallback((userId: number) => {
    const peerConnection = peers[userId];
    if (peerConnection) {
      peerConnection.peer.destroy();
      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
    }
  }, [peers]);

  const cleanup = useCallback(() => {
    Object.keys(peers).forEach(userId => {
      cleanupPeer(Number(userId));
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setIsConnected(false);
  }, [peers, cleanupPeer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    createPeer,
    handleIncomingSignal,
    cleanup
  };
}