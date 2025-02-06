import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Server } from "@shared/schema";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function ServerList({ 
  onServerSelect, 
  selectedServer 
}: { 
  onServerSelect: (server: Server | null) => void;
  selectedServer: Server | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  
  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const createServerMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/servers", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setIsOpen(false);
      setNewServerName("");
    },
  });

  return (
    <div className="w-20 bg-gray-800 flex flex-col items-center py-4 space-y-4">
      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => onServerSelect(server)}
          className={`w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center transition-all ${
            selectedServer?.id === server.id ? "rounded-2xl bg-emerald-600" : ""
          }`}
        >
          {server.name[0].toUpperCase()}
        </button>
      ))}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="rounded-full w-12 h-12"
          >
            <Plus />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new server</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createServerMutation.mutate(newServerName);
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">Server Name</Label>
              <Input
                id="name"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={createServerMutation.isPending}>
              Create Server
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
