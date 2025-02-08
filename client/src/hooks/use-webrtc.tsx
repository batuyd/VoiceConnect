import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioSettings } from './use-audio-settings';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream;
}

export function useWebRTC(channelId: number) {
  const { selectedInputDevice } = useAudioSettings();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Record<number, PeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const createPeer = useCallback(async (targetUserId: number, initiator: boolean): Promise<RTCPeerConnection> => {
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

      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      });

      // Yerel medya akışını ekle
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });

      // ICE aday olaylarını dinle
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            const response = await fetch(`/api/channels/${channelId}/signal`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targetUserId,
                signal: {
                  type: 'candidate',
                  candidate: event.candidate
                }
              })
            });

            if (!response.ok) {
              throw new Error('Failed to send ICE candidate');
            }
          } catch (error) {
            console.error('ICE candidate error:', error);
            cleanupPeer(targetUserId);
          }
        }
      };

      // Bağlantı durumu değişikliklerini izle
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          console.log('WebRTC peer connected');
          setIsConnected(true);
        } else if (peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'failed') {
          console.log('WebRTC peer disconnected or failed');
          cleanupPeer(targetUserId);
        }
      };

      // Uzak medya akışını al
      peerConnection.ontrack = (event) => {
        console.log('Received remote track');
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.play().catch(console.error);
      };

      // Eğer başlatıcıysak, teklif oluştur ve gönder
      if (initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        try {
          const response = await fetch(`/api/channels/${channelId}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUserId,
              signal: {
                type: 'offer',
                sdp: peerConnection.localDescription
              }
            })
          });

          if (!response.ok) {
            throw new Error('Failed to send offer');
          }
        } catch (error) {
          console.error('Offer error:', error);
          cleanupPeer(targetUserId);
          throw error;
        }
      }

      setPeers(prev => ({
        ...prev,
        [targetUserId]: { connection: peerConnection, stream: localStreamRef.current! }
      }));

      return peerConnection;
    } catch (error) {
      console.error('Error creating peer:', error);
      toast({
        description: t('voice.peerConnectionError'),
        variant: "destructive",
      });
      throw error;
    }
  }, [channelId, selectedInputDevice, toast, t]);

  const handleIncomingSignal = useCallback(async (userId: number, signal: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    try {
      let peerConnection = peers[userId]?.connection;

      if (!peerConnection) {
        peerConnection = await createPeer(userId, false);
      }

      if ('type' in signal) {
        if (signal.type === 'offer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          const response = await fetch(`/api/channels/${channelId}/signal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUserId: userId,
              signal: {
                type: 'answer',
                sdp: peerConnection.localDescription
              }
            })
          });

          if (!response.ok) {
            throw new Error('Failed to send answer');
          }
        } else if (signal.type === 'answer') {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'candidate' && 'candidate' in signal) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (error) {
      console.error('Error handling incoming signal:', error);
    }
  }, [peers, createPeer, channelId]);

  const cleanupPeer = useCallback((userId: number) => {
    const peerConnection = peers[userId];
    if (peerConnection) {
      peerConnection.connection.close();
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