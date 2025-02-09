import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioSettings } from './use-audio-settings';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';
import { useWebSocket } from './use-websocket';

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream;
  audioElement?: HTMLAudioElement;
}

export function useWebRTC(channelId: number) {
  const { selectedInputDevice } = useAudioSettings();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { websocket } = useWebSocket();
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<Record<number, PeerConnection>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectAttempts = 3;

  const createPeer = useCallback(async (targetUserId: number, localStream: MediaStream, initiator: boolean): Promise<RTCPeerConnection> => {
    try {
      console.log('Creating peer connection with:', targetUserId);

      const config: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'balanced',
        rtcpMuxPolicy: 'require'
      };

      const peerConnection = new RTCPeerConnection(config);

      // Add local tracks to the connection
      localStream.getTracks().forEach(track => {
        console.log('Adding local track to peer connection:', track.kind);
        peerConnection.addTrack(track, localStream);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate && websocket?.readyState === WebSocket.OPEN) {
          console.log('Sending ICE candidate to:', targetUserId);
          websocket.send(JSON.stringify({
            type: 'webrtc_signal',
            targetUserId,
            signal: {
              type: 'candidate',
              candidate: event.candidate
            }
          }));
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          console.log('WebRTC peer connected');
          setIsConnected(true);
          reconnectAttemptRef.current = 0;
        } else if (peerConnection.connectionState === 'failed') {
          console.log('WebRTC peer connection failed');
          if (reconnectAttemptRef.current < maxReconnectAttempts) {
            reconnectAttemptRef.current++;
            console.log(`Attempting to reconnect (${reconnectAttemptRef.current}/${maxReconnectAttempts})`);
            createPeer(targetUserId, localStream, initiator).catch(console.error);
          } else {
            cleanupPeer(targetUserId);
            toast({
              description: t('voice.connectionFailed'),
              variant: "destructive",
            });
          }
        }
      };

      // Handle negotiation needed
      peerConnection.onnegotiationneeded = async () => {
        if (initiator && websocket?.readyState === WebSocket.OPEN) {
          try {
            console.log('Creating offer for:', targetUserId);
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            });

            await peerConnection.setLocalDescription(offer);

            websocket.send(JSON.stringify({
              type: 'webrtc_signal',
              targetUserId,
              signal: {
                type: 'offer',
                sdp: peerConnection.localDescription
              }
            }));
          } catch (error) {
            console.error('Offer creation error:', error);
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
            toast({
              description: t('voice.audioPlaybackError'),
              variant: "destructive",
            });
          });
        }
      };

      setPeers(prev => ({
        ...prev,
        [targetUserId]: {
          connection: peerConnection,
          stream: localStream
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
  }, [websocket, toast, t]);

  const handleIncomingSignal = useCallback(async (userId: number, signal: any) => {
    try {
      console.log('Handling incoming signal from:', userId, signal);
      let peerConnection = peers[userId]?.connection;

      if (!peerConnection && signal.type === 'offer') {
        if (!localStreamRef.current) {
          console.log('Local stream not ready for incoming offer');
          return;
        }
        console.log('Creating new peer for incoming offer');
        peerConnection = await createPeer(userId, localStreamRef.current, false);
      }

      if (peerConnection) {
        if (signal.type === 'offer') {
          console.log('Processing offer from:', userId);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          if (websocket?.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({
              type: 'webrtc_signal',
              targetUserId: userId,
              signal: {
                type: 'answer',
                sdp: peerConnection.localDescription
              }
            }));
          }
        } else if (signal.type === 'answer') {
          console.log('Processing answer from:', userId);
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.type === 'candidate' && signal.candidate) {
          console.log('Adding ICE candidate from:', userId);
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (error) {
      console.error('Error handling incoming signal:', error);
      toast({
        description: t('voice.signalError'),
        variant: "destructive",
      });
    }
  }, [peers, createPeer, websocket, toast, t]);

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
    reconnectAttemptRef.current = 0;
  }, [peers, cleanupPeer]);

  // WebSocket mesajlarını dinle
  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'webrtc_signal') {
          handleIncomingSignal(message.userId, message.signal);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    websocket.addEventListener('message', handleMessage);

    return () => {
      websocket.removeEventListener('message', handleMessage);
    };
  }, [websocket, handleIncomingSignal]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    peers,
    createPeer,
    handleIncomingSignal,
    cleanup
  };
}