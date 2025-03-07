import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useAuth } from '../hooks/use-auth';
import { Button } from './ui/button'; // Button bileşenini ekleyelim

const ServerDetails = ({ serverId }: { serverId: number }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [channelName, setChannelName] = useState('');
  const [isVoice, setIsVoice] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const { data: server, isLoading: serverLoading } = useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/servers/${serverId}`);
      return res.json();
    },
  });

  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ['channels', serverId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/servers/${serverId}/channels`);
      return res.json();
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/servers/${serverId}/channels`, {
        name: channelName,
        isVoice,
        isPrivate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels', serverId] });
      setChannelName('');
      setIsVoice(false);
      setIsPrivate(false);
    },
  });

  if (serverLoading || channelsLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>{server.name}</h1>
      <div>
        <h2>Channels</h2>
        <ul>
          {channels.map((channel: any) => (
            <li key={channel.id}>{channel.name}</li>
          ))}
        </ul>
      </div>
      {user?.id === server.owner_id && ( // ownerId yerine owner_id kullanıldı
        <div>
          <h2>Create Channel</h2>
          <input
            type="text"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="Channel Name"
          />
          <label>
            <input
              type="checkbox"
              checked={isVoice}
              onChange={(e) => setIsVoice(e.target.checked)}
            />
            Voice Channel
          </label>
          <label>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            Private Channel
          </label>
          <Button onClick={() => createChannelMutation.mutate()}>Create Channel</Button>
        </div>
      )}
    </div>
  );
};

export default ServerDetails;
