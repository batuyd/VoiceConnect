import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioSettings } from './use-audio-settings';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream;
  audioElement?: HTMLAudioElement;
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
        console.log('Requesting user media...');
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        console.log('Got user media stream');
        localStreamRef.current = stream;
      }

      const config = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 0
      };

      console.log('Creating RTCPeerConnection with config:', config);
      const peerConnection = new RTCPeerConnection(config);

      // Add local tracks to the connection
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          console.log('Adding local track to peer connection:', track.kind);
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('Got ICE candidate:', event.candidate);
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

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          console.log('WebRTC peer connected');
          setIsConnected(true);
        } else if (peerConnection.connectionState === 'disconnected' || 
                  peerConnection.connectionState === 'failed') {
          console.log('WebRTC peer disconnected or failed');
          cleanupPeer(targetUserId);
        }
      };

      // Handle negotiation needed
      peerConnection.onnegotiationneeded = async () => {
        console.log('Negotiation needed');
        if (initiator) {
          try {
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            });
            await peerConnection.setLocalDescription(offer);

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
          }
        }
      };

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const [remoteStream] = event.streams;

        if (remoteStream) {
          console.log('Creating new audio element for remote stream');
          const audioElement = new Audio();
          audioElement.srcObject = remoteStream;
          audioElement.autoplay = true;

          setPeers(prev => ({
            ...prev,
            [targetUserId]: {
              ...prev[targetUserId],
              stream: remoteStream,
              audioElement
            }
          }));

          audioElement.play().catch(error => {
            console.error('Error playing remote audio:', error);
          });
        }
      };

      setPeers(prev => ({
        ...prev,
        [targetUserId]: { 
          connection: peerConnection, 
          stream: localStreamRef.current!
        }
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
      console.log('Handling incoming signal:', signal);
      let peerConnection = peers[userId]?.connection;

      if (!peerConnection) {
        console.log('Creating new peer for incoming signal');
        peerConnection = await createPeer(userId, false);
      }

      if ('type' in signal) {
        if (signal.type === 'offer') {
          console.log('Processing offer');
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
          console.log('Processing answer');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (signal.candidate) {
        console.log('Adding ICE candidate');
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
      }
    } catch (error) {
      console.error('Error handling incoming signal:', error);
    }
  }, [peers, createPeer, channelId]);

  const cleanupPeer = useCallback((userId: number) => {
    console.log('Cleaning up peer:', userId);
    const peerConnection = peers[userId];
    if (peerConnection) {
      // Stop all tracks
      peerConnection.stream.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });

      // Close audio element if it exists
      if (peerConnection.audioElement) {
        console.log('Closing audio element');
        peerConnection.audioElement.pause();
        peerConnection.audioElement.srcObject = null;
      }

      // Close peer connection
      peerConnection.connection.close();

      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
    }
  }, [peers]);

  const cleanup = useCallback(() => {
    console.log('Running cleanup');
    Object.keys(peers).forEach(userId => {
      cleanupPeer(Number(userId));
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('Stopping local track:', track.kind);
        track.stop();
      });
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