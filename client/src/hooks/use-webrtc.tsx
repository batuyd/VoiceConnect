import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioSettings } from './use-audio-settings';
import { useToast } from './use-toast';
import { useLanguage } from './use-language';

interface RTCStats {
  timestamp: number;
  jitter: number;
  packetsLost: number;
  roundTripTime: number;
}

interface PeerConnection {
  connection: RTCPeerConnection;
  stream: MediaStream;
  audioElement?: HTMLAudioElement;
  stats: RTCStats;
}

interface AudioConfig {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  channelCount?: number;
  sampleRate?: number;
  sampleSize?: number;
}

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16
};

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    {
      urls: 'turn:global.turn.twilio.com:3478',
      username: process.env.TWILIO_TURN_USERNAME,
      credential: process.env.TWILIO_TURN_CREDENTIAL
    }
  ],
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidatePoolSize: 10
};

export function useWebRTC(channelId: number) {
  const { selectedInputDevice, audioConfig } = useAudioSettings();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isConnected, setIsConnected] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [peers, setPeers] = useState<Record<number, PeerConnection>>({});
  const [connectionQuality, setConnectionQuality] = useState<'excellent' | 'good' | 'poor'>('excellent');

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Record<number, RTCPeerConnection>>({});
  const statsIntervalRef = useRef<NodeJS.Timeout>();
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const initializeAudioStream = useCallback(async () => {
    try {
      console.log('Initializing audio stream with device:', selectedInputDevice);

      const mergedConfig: AudioConfig = {
        ...DEFAULT_AUDIO_CONFIG,
        ...audioConfig
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedInputDevice ? { exact: selectedInputDevice } : undefined,
          ...mergedConfig,
          latency: { ideal: 0.01 }, // 10ms hedef gecikme
          sampleSize: { ideal: mergedConfig.sampleSize },
          sampleRate: { ideal: mergedConfig.sampleRate }
        },
        video: false
      });

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Ses düzeyi analizi için
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      source.connect(analyser);

      localStreamRef.current = stream;
      return true;
    } catch (error: any) {
      console.error('Audio stream initialization error:', error);
      toast({
        title: t('voice.audioError'),
        description: error.name === 'NotAllowedError' 
          ? t('voice.microphonePermissionDenied')
          : t('voice.microphoneAccessError'),
        variant: 'destructive'
      });
      return false;
    }
  }, [selectedInputDevice, audioConfig, toast, t]);

  const monitorConnectionQuality = useCallback((pc: RTCPeerConnection, userId: number) => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let totalJitter = 0;
        let totalPacketsLost = 0;
        let totalRoundTripTime = 0;
        let measurementCount = 0;

        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            totalJitter += report.jitter || 0;
            totalPacketsLost += report.packetsLost || 0;
            measurementCount++;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            totalRoundTripTime += report.currentRoundTripTime || 0;
          }
        });

        if (measurementCount > 0) {
          const averageJitter = totalJitter / measurementCount;
          const averagePacketsLost = totalPacketsLost / measurementCount;
          const averageRoundTripTime = totalRoundTripTime / measurementCount;

          setPeers(prev => ({
            ...prev,
            [userId]: {
              ...prev[userId],
              stats: {
                timestamp: Date.now(),
                jitter: averageJitter,
                packetsLost: averagePacketsLost,
                roundTripTime: averageRoundTripTime
              }
            }
          }));

          // Bağlantı kalitesi değerlendirmesi
          if (averageJitter > 0.1 || averagePacketsLost > 50 || averageRoundTripTime > 300) {
            setConnectionQuality('poor');
          } else if (averageJitter > 0.05 || averagePacketsLost > 20 || averageRoundTripTime > 150) {
            setConnectionQuality('good');
          } else {
            setConnectionQuality('excellent');
          }
        }
      } catch (error) {
        console.error('Error monitoring connection quality:', error);
      }
    }, 2000);
  }, []);

  const createPeer = useCallback(async (targetUserId: number, initiator: boolean): Promise<RTCPeerConnection> => {
    try {
      setIsInitializing(true);
      console.log('Creating peer connection with user:', targetUserId);

      if (!localStreamRef.current) {
        const success = await initializeAudioStream();
        if (!success) {
          throw new Error('Failed to initialize audio stream');
        }
      }

      console.log('Creating RTCPeerConnection with config:', ICE_SERVERS);
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current[targetUserId] = peerConnection;

      // Ses kalitesi optimizasyonları
      peerConnection.getSenders().forEach(sender => {
        if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 128000; // 128 kbps
          params.encodings[0].priority = 'high';
          sender.setParameters(params).catch(console.error);
        }
      });

      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          console.log('Adding local track to peer connection:', track.kind, track.id);
          peerConnection.addTrack(track, localStreamRef.current);
        }
      });

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

      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state changed:', peerConnection.iceConnectionState);
        switch (peerConnection.iceConnectionState) {
          case 'checking':
            toast({
              title: t('voice.connecting'),
              description: t('voice.establishingConnection'),
              variant: 'default'
            });
            break;
          case 'connected':
            toast({
              title: t('voice.connected'),
              description: t('voice.connectionEstablished'),
              variant: 'default'
            });
            monitorConnectionQuality(peerConnection, targetUserId);
            break;
          case 'failed':
            console.error('ICE connection failed');
            toast({
              title: t('voice.connectionFailed'),
              description: t('voice.tryReconnecting'),
              variant: 'destructive'
            });

            // Otomatik yeniden bağlanma
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              cleanupPeer(targetUserId);
              createPeer(targetUserId, initiator);
            }, 5000);
            break;
          case 'disconnected':
            console.warn('ICE connection disconnected');
            toast({
              title: t('voice.connectionLost'),
              description: t('voice.attemptingReconnect'),
              variant: 'default'
            });
            break;
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
          case 'connected':
            setIsConnected(true);
            setIsInitializing(false);
            break;
          case 'failed':
          case 'closed':
            setIsConnected(false);
            setIsInitializing(false);
            cleanupPeer(targetUserId);
            break;
        }
      };

      if (initiator) {
        peerConnection.onnegotiationneeded = async () => {
          try {
            console.log('Creating offer');
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: false
            });

            console.log('Setting local description:', offer.type);
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
            toast({
              title: t('voice.offerError'),
              description: t('voice.connectionFailed'),
              variant: 'destructive'
            });
            cleanupPeer(targetUserId);
          }
        };
      }

      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind, event.track.id);
        const [remoteStream] = event.streams;

        if (remoteStream) {
          const audioElement = new Audio();
          audioElement.srcObject = remoteStream;
          audioElement.autoplay = true;

          // Ses işleme ve kalite iyileştirmeleri
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(remoteStream);
          const gainNode = audioContext.createGain();
          const analyser = audioContext.createAnalyser();

          source.connect(gainNode);
          gainNode.connect(analyser);
          analyser.connect(audioContext.destination);

          setPeers(prev => ({
            ...prev,
            [targetUserId]: {
              ...prev[targetUserId],
              stream: remoteStream,
              audioElement,
              stats: {
                timestamp: Date.now(),
                jitter: 0,
                packetsLost: 0,
                roundTripTime: 0
              }
            }
          }));

          audioElement.play().catch(error => {
            console.error('Error playing remote audio:', error);
            toast({
              title: t('voice.playbackError'),
              description: t('voice.checkAudioSettings'),
              variant: 'destructive'
            });
          });
        }
      };

      setPeers(prev => ({
        ...prev,
        [targetUserId]: {
          connection: peerConnection,
          stream: localStreamRef.current!,
          stats: {
            timestamp: Date.now(),
            jitter: 0,
            packetsLost: 0,
            roundTripTime: 0
          }
        }
      }));

      return peerConnection;
    } catch (error) {
      console.error('Error creating peer:', error);
      setIsInitializing(false);
      throw error;
    }
  }, [channelId, initializeAudioStream, toast, t, monitorConnectionQuality]);

  const handleIncomingSignal = useCallback(async (userId: number, signal: any) => {
    try {
      console.log('Handling incoming signal:', signal.type);
      let peerConnection = peerConnectionsRef.current[userId];

      if (!peerConnection) {
        console.log('Creating new peer for incoming signal');
        peerConnection = await createPeer(userId, false);
      }

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
      } else if (signal.candidate) {
        console.log('Adding ICE candidate');
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal));
      }
    } catch (error) {
      console.error('Error handling incoming signal:', error);
      cleanupPeer(userId);
    }
  }, [channelId, createPeer]);

  const cleanupPeer = useCallback((userId: number) => {
    console.log('Cleaning up peer:', userId);
    const peerConnection = peers[userId];
    if (peerConnection) {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }

      peerConnection.stream.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind, track.id);
        track.stop();
      });

      if (peerConnection.audioElement) {
        console.log('Closing audio element');
        peerConnection.audioElement.pause();
        peerConnection.audioElement.srcObject = null;
      }

      if (peerConnection.connection.connectionState !== 'closed') {
        peerConnection.connection.close();
      }

      setPeers(prev => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });

      delete peerConnectionsRef.current[userId];
    }
  }, [peers]);

  const cleanup = useCallback(() => {
    console.log('Running cleanup');
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    Object.keys(peers).forEach(userId => {
      cleanupPeer(Number(userId));
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('Stopping local track:', track.kind, track.id);
        track.stop();
      });
      localStreamRef.current = null;
    }

    setIsConnected(false);
    setIsInitializing(false);
  }, [peers, cleanupPeer]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isConnected,
    isInitializing,
    connectionQuality,
    createPeer,
    handleIncomingSignal,
    cleanup
  };
}