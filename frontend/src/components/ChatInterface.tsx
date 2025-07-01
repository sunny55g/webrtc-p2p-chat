import { Socket } from "socket.io-client";
import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Wifi, WifiOff } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import io from 'socket.io-client';


type OfferPayload = {
  offer: RTCSessionDescriptionInit;
  room: string;
};

type AnswerPayload = {
  answer: RTCSessionDescriptionInit;
  room: string;
};

type IceCandidatePayload = {
  candidate: RTCIceCandidateInit;
  room: string;
};



interface Message {
  id: string;
  text: string;
  timestamp: Date;
  sender: 'self' | 'peer';
}

const ChatInterface = () => {
  const [publicIp, setPublicIp] = useState('Loading...');
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const { toast } = useToast();
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get public IP address
  useEffect(() => {
    const fetchPublicIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        setPublicIp(data.ip);
      } catch (error) {
        console.error('Failed to fetch public IP:', error);
        setPublicIp('Unknown');
      }
    };
    fetchPublicIp();
  }, []);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (text: string, sender: 'self' | 'peer') => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      timestamp: new Date(),
      sender
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          room: roomId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        setConnectionStatus('connected');
        setIsConnected(true);
        setIsConnecting(false);
        toast({
          title: "Connected!",
          description: "P2P connection established successfully.",
        });
      } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
        setConnectionStatus('disconnected');
        setIsConnected(false);
        setIsConnecting(false);
      }
    };

    return peerConnection;
  };

  const connectToPeer = async () => {
    if (!userName.trim() || !roomId.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your name and room ID.",
        variant: "destructive",
      });
      return;
    }

    setIsConnecting(true);
    setConnectionStatus('connecting');
    
    try {
      // Connect to signaling server (for demo purposes, using a mock WebSocket connection)
      socketRef.current = io("http://localhost:3000", {
        transports: ['websocket']
      });

      socketRef.current.on('connect', () => {
        console.log('Connected to signaling server');
        socketRef.current.emit('join-room', { room: roomId, name: userName });
      });

      // Initialize WebRTC peer connection
      peerConnectionRef.current = createPeerConnection();

      // Create data channel for messaging
      dataChannelRef.current = peerConnectionRef.current.createDataChannel('messages', {
        ordered: true
      });

      dataChannelRef.current.onopen = () => {
        console.log('Data channel opened');
        addMessage('Connected to peer successfully!', 'self');
      };

      dataChannelRef.current.onmessage = (event) => {
        const messageData = JSON.parse(event.data);
        addMessage(`${messageData.sender}: ${messageData.text}`, 'peer');
      };

      // Handle incoming data channels
      peerConnectionRef.current.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onmessage = (event) => {
          const messageData = JSON.parse(event.data);
          addMessage(`${messageData.sender}: ${messageData.text}`, 'peer');
        };
      };

      // Handle signaling messages
      socketRef.current.on('offer', async (data: OfferPayload) => {
  if (peerConnectionRef.current) {
    await peerConnectionRef.current.setRemoteDescription(data.offer);
    const answer = await peerConnectionRef.current.createAnswer();
    await peerConnectionRef.current.setLocalDescription(answer);
    socketRef.current?.emit('answer', { room: roomId, answer });
  }
});

      socketRef.current.on('answer', async (data: AnswerPayload) => {
  if (peerConnectionRef.current) {
    await peerConnectionRef.current.setRemoteDescription(data.answer);
  }
});


      socketRef.current.on('ice-candidate', async (data: IceCandidatePayload) => {
  if (peerConnectionRef.current && data.candidate) {
    try {
      await peerConnectionRef.current.addIceCandidate(data.candidate);
    } catch (err) {
      console.error("Failed to add ICE candidate:", err);
    }
  }
});


      // Create offer to initiate connection
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socketRef.current.emit('offer', { room: roomId, offer });

      // Simulate connection for demo purposes (since we don't have a real signaling server)
      // setTimeout(() => {
      //   setIsConnected(true);
      //   setIsConnecting(false);
      //   setConnectionStatus('connected');
      //   addMessage('Demo mode: Connection simulated successfully!', 'self');
      //   toast({
      //     title: "Demo Connected!",
      //     description: "In demo mode - messages will echo back to you.",
      //   });
      // }, 2000);

    } catch (error) {
      console.error('Connection failed:', error);
      setIsConnecting(false);
      setConnectionStatus('disconnected');
      toast({
        title: "Connection Failed",
        description: "Unable to establish peer connection.",
        variant: "destructive",
      });
    }
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !isConnected) return;

    const messageData = {
      sender: userName,
      text: messageInput.trim()
    };

    // Add to local messages
    addMessage(`You: ${messageInput.trim()}`, 'self');

    // Send via WebRTC data channel
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(messageData));
    } else {
      // Demo mode - echo the message back
      setTimeout(() => {
        addMessage(`Echo: ${messageInput.trim()}`, 'peer');
      }, 500);
    }

    setMessageInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const disconnect = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    setConnectionStatus('disconnected');
    setMessages([]);
    
    toast({
      title: "Disconnected",
      description: "Peer connection closed.",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-2xl font-semibold text-slate-800 flex items-center justify-center gap-2">
            {connectionStatus === 'connected' ? (
              <Wifi className="h-6 w-6 text-green-500" />
            ) : (
              <WifiOff className="h-6 w-6 text-slate-400" />
            )}
            P2P Chat
          </CardTitle>
          <div className="flex items-center justify-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' : 
              'bg-slate-300'
            }`} />
            <span className="text-slate-600 capitalize">{connectionStatus}</span>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Your Public IP</label>
              <Input
                value={publicIp}
                readOnly
                className="bg-slate-50 text-slate-600 cursor-default"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Your Name</label>
              <Input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                disabled={isConnected}
                className="transition-all duration-200"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">Room ID (IP:Port)</label>
              <Input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="192.168.1.1:8080"
                disabled={isConnected}
                className="transition-all duration-200"
              />
            </div>
          </div>

          {!isConnected ? (
            <Button
              onClick={connectToPeer}
              disabled={isConnecting}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02]"
            >
              {isConnecting ? 'Connecting...' : 'Connect to Peer'}
            </Button>
          ) : (
            <Button
              onClick={disconnect}
              variant="destructive"
              className="w-full font-medium py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Disconnect
            </Button>
          )}

          {isConnected && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <ScrollArea className="h-48 w-full border rounded-lg bg-slate-50/50 p-3">
                <div className="space-y-2">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`text-sm p-2 rounded-lg max-w-[80%] ${
                        message.sender === 'self'
                          ? 'bg-blue-500 text-white ml-auto'
                          : 'bg-white text-slate-700 shadow-sm'
                      }`}
                    >
                      <div className="font-medium">{message.text}</div>
                      <div className={`text-xs mt-1 ${
                        message.sender === 'self' ? 'text-blue-100' : 'text-slate-500'
                      }`}>
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="flex-1"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!messageInput.trim()}
                  size="icon"
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatInterface;
