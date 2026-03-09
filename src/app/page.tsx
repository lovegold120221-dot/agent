"use client";
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { 
  Menu, 
  MoreVertical, 
  Plus, 
  Mic, 
  X, 
  Camera, 
  Image as ImageIcon, 
  FileText, 
  Search, 
  BookOpen, 
  Cpu, 
  Grid,
  Send,
  Loader2,
  Brain,
  Radio,
  Square,
  ChevronLeft,
  Settings,
  User,
  Shield,
  PhoneOff,
  Phone,
  PenTool,
  Code,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { 
  generateChatResponse, 
  generateChatResponseStream,
  generateImage, 
  analyzeImage, 
  textToSpeech, 
  transcribeAudio,
  connectLive,
  editImage,
  createChat,
  SYSTEM_PROMPT
} from '../services/gemini';
import { tools, executeTool } from "../services/tools";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface Message {
  role: 'user' | 'model';
  text: string;
  image?: string;
  audio?: string;
  isImageGen?: boolean;
  groundingMetadata?: any;
  originalPrompt?: string;
}

type ViewState = 'home' | 'chat';

const CodeBlock = ({ className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const isInline = !match && !String(children).includes('\n');
  const language = match ? match[1] : '';
  const isHtml = language === 'html' || language === 'xml';
  const codeString = String(children).replace(/\n$/, '');
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(isHtml);

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isInline) {
    return <code className="bg-white/10 rounded px-1.5 py-0.5 text-sm font-mono text-blue-300" {...props}>{children}</code>;
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-neutral-800 bg-[#121212]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-neutral-800">
        <div className="flex items-center space-x-4">
          <span className="text-xs font-medium text-neutral-400 uppercase">{language || 'code'}</span>
          {isHtml && (
            <div className="flex items-center space-x-2 bg-black/20 rounded-lg p-0.5">
              <button 
                onClick={() => setShowPreview(false)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${!showPreview ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Code
              </button>
              <button 
                onClick={() => setShowPreview(true)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${showPreview ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
              >
                Preview
              </button>
            </div>
          )}
        </div>
        <button 
          onClick={handleCopy}
          className="text-xs text-neutral-400 hover:text-white transition-colors flex items-center space-x-1"
        >
          {copied ? <span>Copied!</span> : <span>Copy</span>}
        </button>
      </div>
      
      {!showPreview ? (
        <div className="p-4 overflow-x-auto text-sm font-mono text-neutral-300 whitespace-pre">
          <code className={className} {...props}>{children}</code>
        </div>
      ) : (
        <div className="bg-white w-full h-[400px]">
          <iframe 
            srcDoc={codeString} 
            className="w-full h-full border-none"
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
          />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<'account' | 'settings' | 'data' | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [attachment, setAttachment] = useState<{ url: string, type: string } | null>(null);
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment');
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  
  // Image options
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  
  const [userContext, setUserContext] = useState('');
  const [responseStyle, setResponseStyle] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const savedUserContext = localStorage.getItem('eburon_userContext');
    const savedResponseStyle = localStorage.getItem('eburon_responseStyle');
    const savedTheme = localStorage.getItem('eburon_theme') as 'light' | 'dark' | 'system' || 'system';
    if (savedUserContext) setUserContext(savedUserContext);
    if (savedResponseStyle) setResponseStyle(savedResponseStyle);
    setTheme(savedTheme);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('eburon_userContext', userContext);
    localStorage.setItem('eburon_responseStyle', responseStyle);
    localStorage.setItem('eburon_theme', theme);
    setActiveModal(null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    });
    if (error) setAuthError(error.message);
    else setAuthError('Check your email for the login link!');
    setAuthLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, view]);

  useEffect(() => {
    return () => {
      stopLiveSession();
    };
  }, []);

  const clearChat = () => {
    setMessages([]);
    setCurrentChatId(null);
    setView('home');
    setIsHeaderMenuOpen(false);
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!user) return;
    
    const { error } = await supabase
      .from('chats')
      .delete()
      .eq('id', chatId);
    
    if (!error) {
      if (currentChatId === chatId) {
        clearChat();
      }
      fetchChatHistory();
    }
  };

  const startLiveSession = async () => {
    try {
      if (window.aistudio) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      const sessionPromise = connectLive(
        (sessionPromise) => {
          console.log("Live session opened");
          setIsLiveActive(true);
          
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            sessionPromise.then((session) => {
              session.sendRealtimeInput({
                media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
              });
            });
          };

          source.connect(processor);
          processor.connect(audioContextRef.current!.destination);
          
          streamRef.current = stream;
          processorRef.current = processor;
        },
        (message) => {
          if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
            const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const pcmData = new Int16Array(bytes.buffer);
            audioQueueRef.current.push(pcmData);
            if (!isPlayingRef.current) playNextInQueue();
          }

          if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
            setLiveTranscription(prev => prev + ' ' + message.serverContent.modelTurn.parts[0].text);
          }

          if (message.serverContent?.inputAudioTranscription?.text) {
            setLiveTranscription(message.serverContent.inputAudioTranscription.text);
          }
          
          if (message.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
            setIsSpeaking(false);
          }
        },
        (err) => console.error("Live error:", err),
        () => {
          console.log("Live session closed");
          stopLiveSession();
        },
        userContext,
        responseStyle
      );

      liveSessionRef.current = await sessionPromise;

    } catch (err) {
      console.error("Failed to start live session:", err);
      setIsVoiceOpen(false);
    }
  };

  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isPlayingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    const pcmData = audioQueueRef.current.shift()!;
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, 16000);
    buffer.getChannelData(0).set(float32Data);
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = playNextInQueue;
    source.start();
  };

  const stopLiveSession = () => {
    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch(e) {}
      liveSessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsLiveActive(false);
    setIsVoiceOpen(false);
    setIsSpeaking(false);
    setLiveTranscription('');
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  };

  const toggleVoiceMode = async (active: boolean) => {
    if (active) {
      setIsVoiceOpen(true);
      await startLiveSession();
    } else {
      stopLiveSession();
    }
  };

  const handleRetryImage = (prompt: string) => {
    setInput(prompt);
    sendMessage(prompt);
  };

  const handleEditImage = (prompt: string, imageUrl: string) => {
    setAttachment({ url: imageUrl, type: 'image/png' });
    setInput(`Edit this image: `);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  useEffect(() => {
    if (user) {
      fetchChatHistory();
    } else {
      setChatHistory([]);
      setCurrentChatId(null);
    }
  }, [user]);

  const fetchChatHistory = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setChatHistory(data);
    }
  };

  const loadChat = async (chatId: string) => {
    setIsLoading(true);
    setIsSidebarOpen(false);
    setCurrentChatId(chatId);
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      const formattedMessages: Message[] = data.map(m => ({
        role: m.role,
        text: m.text,
        image: m.image_url,
        isImageGen: m.is_image_gen,
        original_prompt: m.original_prompt
      }));
      setMessages(formattedMessages);
      setView('chat');
    }
    setIsLoading(false);
  };

  const createNewChat = (initialText?: string) => {
    setMessages([]);
    setCurrentChatId(null);
    setView('home');
    setIsSidebarOpen(false);
  };

  const saveMessageToDb = async (msg: Message) => {
    if (!user) return;
    try {
      let chatId = currentChatId;
      
      if (!chatId) {
        // Create new chat
        const title = msg.text.slice(0, 30) + (msg.text.length > 30 ? '...' : '');
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            user_id: user.id,
            title: title,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (chatError || !newChat) throw chatError;
        chatId = newChat.id;
        setCurrentChatId(chatId);
        fetchChatHistory();
      }

      let imageUrl = msg.image;
      if (msg.image && msg.image.startsWith('data:image')) {
        // Upload to storage
        const base64Data = msg.image.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        const fileName = `${user.id}/${Date.now()}.png`;
        
        const { data, error } = await supabase.storage.from('chat-images').upload(fileName, blob);
        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from('chat-images').getPublicUrl(fileName);
          imageUrl = publicUrlData.publicUrl;
        }
      }

      await supabase.from('messages').insert({
        chat_id: chatId,
        user_id: user.id,
        role: msg.role,
        text: msg.text,
        image_url: imageUrl,
        is_image_gen: msg.isImageGen,
        original_prompt: msg.originalPrompt,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('Failed to save message to DB', e);
    }
  };

  const sendMessage = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() && !attachment) return;
    
    if (view === 'home') setView('chat');
    
    const userMessage: Message = { role: 'user', text: textToSend };
    if (attachment) {
      userMessage.image = attachment.url;
    }
    setMessages(prev => [...prev, userMessage]);
    saveMessageToDb(userMessage);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    setIsLoading(true);
    try {
      if (attachment) {
        const base64 = attachment.url.split(',')[1];
        const imageUrl = await editImage(textToSend, base64, attachment.type);
        if (imageUrl) {
          const modelMessage: Message = { role: 'model', text: 'Here is your edited image:', image: imageUrl, isImageGen: true, originalPrompt: textToSend };
          setMessages(prev => [...prev, modelMessage]);
          saveMessageToDb(modelMessage);
        } else {
           const modelMessage: Message = { role: 'model', text: 'Sorry, I could not edit the image.' };
           setMessages(prev => [...prev, modelMessage]);
           saveMessageToDb(modelMessage);
        }
        setAttachment(null);
      } else if (textToSend.toLowerCase().startsWith('create an image') || textToSend.toLowerCase().startsWith('generate an image') || textToSend.toLowerCase().startsWith('edit this image')) {
        const isBasic = imageSize === '1K' && aspectRatio === '1:1';
        if (!isBasic && window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await window.aistudio.openSelectKey();
          }
        }
        const imageUrl = await generateImage(textToSend, imageSize, aspectRatio);
        if (imageUrl) {
          const modelMessage: Message = { role: 'model', text: 'Here is your generated image:', image: imageUrl, isImageGen: true, originalPrompt: textToSend };
          setMessages(prev => [...prev, modelMessage]);
          saveMessageToDb(modelMessage);
        }
      } else {
        // Format history to ensure strictly alternating roles and valid text for memory
        const history: any[] = [];
        let expectedRole = 'user';
        
        for (const m of messages) {
          if (!m.text || m.isImageGen) continue;
          
          if (m.role === expectedRole) {
            history.push({
              role: m.role,
              parts: [{ text: m.text }]
            });
            expectedRole = expectedRole === 'user' ? 'model' : 'user';
          } else if (history.length > 0) {
            // If we get consecutive messages of the same role, append to the last one
            const lastMsg = history[history.length - 1];
            lastMsg.parts[0].text += '\n\n' + m.text;
          }
        }
        
        // Ensure history ends with 'model' so the new prompt can be 'user'
        if (history.length > 0 && history[history.length - 1].role === 'user') {
          history.pop();
        }
        
        // Initialize an empty model message
        const modelMessage: Message = { 
          role: 'model', 
          text: '',
        };
        
        setMessages(prev => [...prev, modelMessage]);
        
        let fullText = '';
        let groundingMetadata = null;
        
        try {
          const stream = generateChatResponseStream(textToSend, history, isThinking, isFastMode, userContext, responseStyle, tools);
          for await (const chunk of stream) {
            fullText += chunk.text || '';
            if (chunk.groundingMetadata) {
              groundingMetadata = chunk.groundingMetadata;
            }
            
            // Update the last message in the list
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg && lastMsg.role === 'model') {
                lastMsg.text = fullText;
                lastMsg.groundingMetadata = groundingMetadata;
              }
              return newMessages;
            });
          }
          
          // Save the final message to DB
          const finalMessage = { ...modelMessage, text: fullText, groundingMetadata };
          saveMessageToDb(finalMessage);
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          // Fallback to non-streaming if needed or handle error
          throw streamError;
        }
      }
    } catch (error) {
      console.error(error);
      const errorMessage: Message = { role: 'model', text: 'Sorry, something went wrong.' };
      setMessages(prev => [...prev, errorMessage]);
      saveMessageToDb(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      setVoiceStatus("Recording...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setVoiceStatus("Processing...");
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsLoading(true);
          try {
            const transcription = await transcribeAudio(base64, 'audio/webm');
            if (transcription) {
              const lowerTranscript = transcription.toLowerCase().trim();
              
              // Voice Commands
              if (lowerTranscript.includes('create new chat') || lowerTranscript.includes('start new chat')) {
                createNewChat();
                setVoiceStatus(null);
                return;
              }
              if (lowerTranscript.includes('clear history') || lowerTranscript.includes('delete history')) {
                setMessages([]);
                setVoiceStatus(null);
                return;
              }
              if (lowerTranscript.includes('open settings') || lowerTranscript.includes('show settings')) {
                setActiveModal('settings');
                setVoiceStatus(null);
                return;
              }
              
              setInput(transcription);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
              }
              sendMessage(transcription);
              setVoiceStatus(null);
            } else {
              setVoiceStatus("Could not transcribe audio.");
              setTimeout(() => setVoiceStatus(null), 3000);
            }
          } catch (error) {
            console.error(error);
            setVoiceStatus("Transcription failed.");
            setTimeout(() => setVoiceStatus(null), 3000);
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setVoiceStatus("Microphone access denied.");
      setTimeout(() => setVoiceStatus(null), 3000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (view === 'home') setView('chat');
    setIsMenuOpen(false);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const mimeType = file.type;
      
      const userMsg: Message = { role: 'user', text: `Analyzed ${file.name}`, image: event.target?.result as string };
      setMessages(prev => [...prev, userMsg]);
      saveMessageToDb(userMsg);
      setIsLoading(true);
      try {
        const response = await analyzeImage("What is in this image?", base64, mimeType);
        const modelMsg: Message = { role: 'model', text: response || '' };
        setMessages(prev => [...prev, modelMsg]);
        saveMessageToDb(modelMsg);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const startCamera = async () => {
    setIsCameraOpen(true);
    setIsMenuOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: cameraFacing } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  };

  const switchCamera = async () => {
    const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(newFacing);
    
    // Stop current stream
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    // Start new stream
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: newFacing } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error switching camera:", err);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        setAttachment({ url: dataUrl, type: 'image/png' });
        if (view === 'home') setView('chat');
        stopCamera();
      }
    }
  };

  const triggerAction = (prompt: string) => {
    setInput(prompt);
    setIsMenuOpen(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  return (
    <div className="flex justify-center h-[100dvh] overflow-hidden bg-zinc-900 font-sans">
      <div className="w-full max-w-md bg-black flex flex-col relative h-[100dvh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <header className="flex justify-between items-center px-4 py-4 z-20 bg-black/80 backdrop-blur-md absolute top-0 w-full">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-11 h-11 bg-[#212121] rounded-full flex items-center justify-center text-white hover:bg-[#2f2f2f] transition-colors"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M4 8h16M4 16h10"></path></svg>
          </button>
          <div className="h-11 bg-[#212121] rounded-full flex items-center px-2 space-x-1">
            <button 
              onClick={() => setIsFastMode(!isFastMode)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isFastMode ? 'text-emerald-400 bg-emerald-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Fast Mode"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle></svg>
            </button>
            <button 
              onClick={() => setIsThinking(!isThinking)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isThinking ? 'text-blue-400 bg-blue-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Thinking Mode"
            >
              <Brain size={18} className={isThinking ? 'animate-pulse' : ''} />
            </button>
            <div className="relative">
              <button 
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="w-9 h-9 flex items-center justify-center text-neutral-300 hover:text-white rounded-full"
              >
                <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="18" r="1.5"></circle></svg>
              </button>
              
              <AnimatePresence>
                {isHeaderMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-30" 
                      onClick={() => setIsHeaderMenuOpen(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-2xl shadow-2xl z-40 overflow-hidden"
                    >
                      <button 
                        onClick={clearChat}
                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-red-400/10 transition-colors flex items-center space-x-2"
                      >
                        <X size={16} />
                        <span>Clear Chat</span>
                      </button>
                      <button 
                        onClick={() => setIsHeaderMenuOpen(false)}
                        className="w-full px-4 py-3 text-left text-sm text-neutral-300 hover:bg-white/5 transition-colors flex items-center space-x-2"
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {view === 'home' ? (
              <motion.main 
                key="home"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="absolute inset-0 flex flex-col items-center justify-center pb-20 pt-20 z-10"
              >
                <div className="mb-6 relative w-24 h-24 p-4 rounded-full border-2 border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  <div className="relative w-full h-full">
                    <Image 
                      src="https://eburon.ai/icon-eburon.svg" 
                      alt="Eburon AI Logo" 
                      fill 
                      className="object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
                <h1 className="text-[28px] font-bold tracking-tight text-white mb-2">Eburon AI</h1>
                <p className="text-sm font-medium text-neutral-400 mb-6">The Future of Intelligence</p>
                <div className="flex flex-col items-center space-y-1">
                  <p className="text-base text-neutral-200 font-medium"></p>
                  <p className="text-xs text-neutral-500 italic"></p>
                </div>
              </motion.main>
            ) : (
              <motion.main 
                key="chat"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                ref={scrollRef}
                className="absolute inset-0 overflow-y-auto hide-scrollbar pt-24 pb-24 px-4 z-10 flex flex-col space-y-6"
              >
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-[#2f2f2f] text-white rounded-tr-sm' : 'bg-transparent text-neutral-200'}`}>
                      {msg.role === 'model' ? (
                        <div className="flex items-start">
                          <div className="w-6 h-6 mr-3 shrink-0 rounded-md bg-white text-black flex items-center justify-center font-bold text-xs">E</div>
                          <div className="flex-1 overflow-hidden">
                            {msg.image && (
                              <div className="relative group mb-4">
                                <img src={msg.image} alt="Generated" className="rounded-xl w-full object-cover shadow-lg border border-white/10 cursor-pointer" referrerPolicy="no-referrer" onClick={() => window.open(msg.image, '_blank')} />
                                <div className="absolute top-2 right-2 p-1 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                  <img src={msg.image} alt="Preview" className="w-16 h-16 rounded-lg object-cover border border-white/20" />
                                </div>
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2">
                                  {msg.isImageGen && (
                                    <>
                                      <button
                                        onClick={() => msg.originalPrompt && handleRetryImage(msg.originalPrompt)}
                                        className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full transition-colors"
                                        title="Retry"
                                      >
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                      </button>
                                      <button
                                        onClick={() => msg.originalPrompt && handleEditImage(msg.originalPrompt, msg.image!)}
                                        className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full transition-colors"
                                        title="Edit"
                                      >
                                        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                      </button>
                                    </>
                                  )}
                                  <a 
                                    href={msg.image} 
                                    download="generated-image.png"
                                    className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full font-medium text-sm transition-colors flex items-center space-x-2"
                                  >
                                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"></path></svg>
                                    <span>Download</span>
                                  </a>
                                </div>
                              </div>
                            )}
                            <div className="markdown-body text-neutral-200">
                              <Markdown components={{ code: CodeBlock }}>{msg.text}</Markdown>
                            </div>
                            {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                              <div className="mt-4 pt-3 border-t border-white/10">
                                <p className="text-xs text-neutral-400 mb-2 flex items-center">
                                  <Search size={12} className="mr-1.5" /> Sources
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {msg.groundingMetadata.groundingChunks.map((chunk: any, idx: number) => {
                                    const web = chunk.web;
                                    if (!web) return null;
                                    return (
                                      <a 
                                        key={idx} 
                                        href={web.uri} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="inline-flex items-center max-w-full bg-[#2a2a2a] hover:bg-[#333] rounded-lg px-2.5 py-1.5 transition-colors text-xs text-blue-300 border border-white/5"
                                      >
                                        <span className="truncate max-w-[200px]">{web.title}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.image && <img src={msg.image} alt="Upload" className="rounded-lg mb-2 max-w-full" referrerPolicy="no-referrer" />}
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex items-center space-x-3 text-neutral-400 text-sm">
                    <div className="w-6 h-6 shrink-0 rounded-md bg-white/10 text-white flex items-center justify-center">
                      <Loader2 size={14} className="animate-spin" />
                    </div>
                    <span>Echo is thinking...</span>
                  </div>
                )}
              </motion.main>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Input Area */}
        <footer className="absolute bottom-0 px-4 pb-5 z-20 w-full bg-gradient-to-t from-black via-black to-transparent pt-6">
          <div className="flex items-end space-x-2">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="w-12 h-12 bg-[#212121] rounded-full flex items-center justify-center text-neutral-300 shrink-0 hover:bg-[#2f2f2f] transition-colors"
            >
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
            </button>

            <div className="flex-1 bg-[#212121] rounded-[24px] flex flex-col justify-end p-2 relative min-h-[52px]">
              {isThinking && input.length === 0 && (
                <div className="absolute -top-[42px] left-0 bg-[#202936] text-[#4ba1ff] rounded-full px-3 py-1.5 flex items-center space-x-2 w-max transition-opacity">
                  <Brain size={16} />
                  <span className="text-[13px] font-medium tracking-wide">Thinking</span>
                  <button onClick={() => setIsThinking(false)} className="text-[#4ba1ff] hover:text-blue-300 ml-1">
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex items-end w-full pr-1 pb-1">
                <AnimatePresence>
                  {attachment && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="absolute -top-16 left-4 bg-[#2a2a2a] p-1 rounded-xl border border-neutral-700 shadow-lg flex items-center space-x-2"
                    >
                      <img src={attachment.url} alt="Attachment" className="w-12 h-12 object-cover rounded-lg" />
                      <button 
                        onClick={() => setAttachment(null)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                      >
                        <X size={12} />
                      </button>
                    </motion.div>
                  )}
                  {showImageSettings && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute -top-14 left-0 right-0 flex justify-center space-x-2 px-4"
                    >
                      <div className="flex items-center space-x-2 bg-[#1a1a1a] p-1 rounded-full border border-neutral-800 shadow-2xl">
                        <div className="flex items-center space-x-1 px-2 border-r border-neutral-800">
                          <ImageIcon size={14} className="text-purple-400" />
                          <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-tight">Image Gen</span>
                        </div>
                        <select 
                          value={imageSize} 
                          onChange={(e) => setImageSize(e.target.value as any)}
                          className="bg-transparent text-[11px] font-medium text-white rounded-full px-2 py-1 focus:outline-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="1K">1K</option>
                          <option value="2K">2K</option>
                          <option value="4K">4K</option>
                        </select>
                        <select 
                          value={aspectRatio} 
                          onChange={(e) => setAspectRatio(e.target.value)}
                          className="bg-transparent text-[11px] font-medium text-white rounded-full px-2 py-1 focus:outline-none cursor-pointer hover:bg-white/5"
                        >
                          <option value="1:1">1:1</option>
                          <option value="16:9">16:9</option>
                          <option value="9:16">9:16</option>
                          <option value="4:3">4:3</option>
                          <option value="3:4">3:4</option>
                        </select>
                        <button 
                          onClick={() => setShowImageSettings(false)}
                          className="p-1 text-neutral-500 hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex items-center w-full">
                  <button 
                    onClick={() => setShowImageSettings(!showImageSettings)}
                    className={`p-1.5 ml-1 rounded-lg transition-colors ${showImageSettings ? 'text-purple-400 bg-purple-400/10' : 'text-neutral-500 hover:text-white'}`}
                    title="Image Generation Settings"
                  >
                    <PenTool size={18} />
                  </button>
                  <textarea 
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1} 
                    className="flex-1 bg-transparent text-white placeholder-neutral-400 text-[15px] focus:outline-none pl-2 py-1.5 hide-scrollbar max-h-24" 
                    placeholder={showImageSettings ? "Describe the image you want to create..." : "Ask Echo AI"}
                  />
                </div>
                
                {input.trim().length === 0 ? (
                  <>
                    <button 
                      onMouseDown={startRecording}
                      onMouseUp={stopRecording}
                      onTouchStart={startRecording}
                      onTouchEnd={stopRecording}
                      className={`w-9 h-9 flex items-center justify-center shrink-0 transition-colors ${isRecording ? 'text-red-500' : 'text-neutral-400 hover:text-white'}`}
                    >
                      {isRecording ? <Square size={20} /> : <Mic size={20} />}
                    </button>
                    {voiceStatus && (
                      <div className="absolute bottom-16 left-4 bg-neutral-800 text-white text-xs px-2 py-1 rounded">
                        {voiceStatus}
                      </div>
                    )}
                    <button 
                      onClick={() => toggleVoiceMode(true)}
                      className="w-[34px] h-[34px] bg-white rounded-full flex items-center justify-center shrink-0 ml-1 hover:scale-105 transition-transform"
                    >
                      <div className="flex items-center space-x-[2px]">
                        <div className="w-[2.5px] h-[8px] bg-black rounded-full"></div>
                        <div className="w-[2.5px] h-[14px] bg-black rounded-full"></div>
                        <div className="w-[2.5px] h-[10px] bg-black rounded-full"></div>
                        <div className="w-[2.5px] h-[16px] bg-black rounded-full"></div>
                        <div className="w-[2.5px] h-[6px] bg-black rounded-full"></div>
                      </div>
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => sendMessage()}
                    className="w-[34px] h-[34px] bg-white text-black rounded-full flex items-center justify-center shrink-0 ml-1 hover:bg-neutral-200"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>

        {/* Voice Mode Overlay */}
        <AnimatePresence>
          {isVoiceOpen && (
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute inset-0 bg-black z-50 flex flex-col justify-between overflow-hidden"
            >
              {/* Animated Background Gradients */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] transition-opacity duration-1000 ${isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] transition-opacity duration-1000 ${isLiveActive && !isSpeaking ? 'opacity-100' : 'opacity-0'}`} />
              </div>

              <div className="p-6 flex justify-between items-center text-neutral-400 relative z-10">
                <div className="flex items-center space-x-3 bg-white/5 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
                  <div className={`w-2.5 h-2.5 rounded-full ${!isLiveActive ? 'bg-yellow-400 animate-pulse' : isSpeaking ? 'bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]' : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]'}`} />
                  <span className="text-sm font-medium text-white">
                    {!isLiveActive ? 'Connecting to Echo...' : isSpeaking ? 'Echo is speaking' : 'Echo is listening'}
                  </span>
                </div>
                <button 
                  onClick={stopLiveSession}
                  className="p-2.5 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors backdrop-blur-md"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                <div className="relative flex items-center justify-center w-64 h-64">
                  {/* Listening Radar Ping */}
                  <AnimatePresence>
                    {isLiveActive && !isSpeaking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 0, scale: 2 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                        className="absolute inset-0 border-2 border-emerald-500/30 rounded-full"
                      />
                    )}
                  </AnimatePresence>

                  {/* Playback Progress Ring */}
                  <AnimatePresence>
                    {isSpeaking && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 border-2 border-blue-500/20 rounded-full shadow-[0_0_30px_rgba(59,130,246,0.2)]"
                      >
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          className="absolute inset-[-2px] border-t-2 border-l-2 border-blue-400 rounded-full"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Central Waveform */}
                  <div className="flex items-center space-x-2 h-24 relative z-10">
                    {[...Array(5)].map((_, i) => (
                      <motion.div 
                        key={i}
                        animate={!isLiveActive ? {
                          height: 8,
                          backgroundColor: '#52525b'
                        } : isSpeaking ? { 
                          height: [16, 64, 24, 80, 16],
                          backgroundColor: ['#60a5fa', '#3b82f6', '#60a5fa']
                        } : {
                          height: [12, 32, 12],
                          backgroundColor: '#34d399'
                        }}
                        transition={{ 
                          duration: isSpeaking ? 0.5 : 1.5, 
                          repeat: Infinity, 
                          delay: i * 0.1,
                          ease: "easeInOut"
                        }}
                        className={`w-3 rounded-full ${isSpeaking ? 'shadow-[0_0_15px_rgba(59,130,246,0.6)]' : isLiveActive ? 'shadow-[0_0_10px_rgba(52,211,153,0.4)]' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="mt-16 px-8 w-full max-w-md text-center min-h-[100px] flex flex-col justify-center">
                  <AnimatePresence mode="wait">
                    {liveTranscription ? (
                      <motion.p 
                        key="transcription"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-white text-xl font-medium leading-relaxed"
                      >
                        "{liveTranscription.trim()}"
                      </motion.p>
                    ) : (
                      <motion.p 
                        key="placeholder"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        className="text-white/60 text-sm tracking-[0.2em] uppercase font-medium"
                      >
                        {isLiveActive ? 'Start speaking...' : 'Establishing connection...'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="p-10 flex justify-center pb-16 relative z-10">
                <button 
                  onClick={stopLiveSession}
                  className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all hover:scale-105"
                >
                  <PhoneOff size={28} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar Menu */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="absolute inset-0 bg-black/60 z-50"
              />
              <motion.div 
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute top-0 left-0 w-[75%] h-full bg-[#111] z-50 flex flex-col"
              >
                <div className="p-6 border-b border-neutral-800 flex justify-between items-center">
                  <div className="flex items-center space-x-3">
                    <div className="relative w-8 h-8">
                      <Image 
                        src="https://eburon.ai/icon-eburon.svg" 
                        alt="Echo AI Logo" 
                        fill 
                        className="object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <span className="font-semibold text-lg">Eburon AI</span>
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-neutral-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                
                <div className="p-4 border-b border-neutral-800">
                  <button 
                    onClick={() => createNewChat()}
                    className="w-full flex items-center justify-center space-x-2 bg-white text-black p-3 rounded-xl font-medium hover:bg-neutral-200 transition-colors"
                  >
                    <Plus size={18} />
                    <span>New Chat</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 hide-scrollbar">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-2">History</div>
                  {chatHistory.length === 0 ? (
                    <div className="text-neutral-500 text-sm px-2 py-4 italic">No chat history yet</div>
                  ) : (
                    chatHistory.map((chat) => (
                      <button 
                        key={chat.id}
                        onClick={() => loadChat(chat.id)}
                        className={`w-full text-left p-3 rounded-xl transition-colors group flex items-center space-x-3 ${currentChatId === chat.id ? 'bg-[#212121] text-white' : 'text-neutral-400 hover:bg-[#212121] hover:text-white'}`}
                      >
                        <div className="flex-1 truncate text-sm font-medium">{chat.title}</div>
                        <div className="flex items-center space-x-2">
                          <div className="text-[10px] text-neutral-600 group-hover:text-neutral-400">
                            {new Date(chat.created_at).toLocaleDateString()}
                          </div>
                          <button 
                            onClick={(e) => deleteChat(e, chat.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="p-4 border-t border-neutral-800 space-y-2">
                  <button onClick={() => setActiveModal('account')} className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-[#212121] text-neutral-300 transition-colors text-sm">
                    <User size={18} />
                    <span>Account</span>
                  </button>
                  <button onClick={() => setActiveModal('settings')} className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-[#212121] text-neutral-300 transition-colors text-sm">
                    <Settings size={18} />
                    <span>Settings</span>
                  </button>
                  <button onClick={handleSignOut} className="w-full flex items-center space-x-3 p-3 rounded-xl hover:bg-[#212121] text-red-400 transition-colors text-sm">
                    <PhoneOff size={18} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Settings Modals */}
        <AnimatePresence>
          {activeModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 z-[70] flex items-center justify-center p-4"
            >
              <motion.div 
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-[#1a1a1a] w-full max-w-md rounded-3xl border border-neutral-800 overflow-hidden flex flex-col max-h-[80vh]"
              >
                <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
                  <h3 className="font-semibold text-white">
                    {activeModal === 'account' && 'Account Settings'}
                    {activeModal === 'settings' && 'Settings'}
                    {activeModal === 'data' && 'Data Controls'}
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-neutral-400 hover:text-white p-1">
                    <X size={20} />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto">
                  {activeModal === 'account' && (
                    <div className="space-y-4 text-sm text-neutral-300">
                      {user ? (
                        <>
                          <div className="flex items-center space-x-4 mb-6">
                            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white text-lg font-semibold uppercase">
                              {user.email?.[0] || 'U'}
                            </div>
                            <div>
                              <p className="text-white font-medium">User Account</p>
                              <p className="text-neutral-500">{user.email}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="font-medium text-white">Subscription</p>
                            <p>Echo Plus (Active)</p>
                          </div>
                          <button onClick={handleSignOut} className="mt-4 w-full py-2.5 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors font-medium">
                            Sign Out
                          </button>
                        </>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-white font-medium mb-4 text-center">Sign in to your account</p>
                          {authError && <p className="text-red-400 text-xs text-center">{authError}</p>}
                          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
                            <input 
                              type="email" 
                              placeholder="Email" 
                              value={authEmail}
                              onChange={(e) => setAuthEmail(e.target.value)}
                              className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                            />
                            <input 
                              type="password" 
                              placeholder="Password" 
                              value={authPassword}
                              onChange={(e) => setAuthPassword(e.target.value)}
                              className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600"
                            />
                            <div className="flex space-x-2 pt-2">
                              <button 
                                onClick={handleSignIn}
                                disabled={authLoading}
                                className="flex-1 py-2.5 bg-white text-black rounded-xl font-medium hover:bg-neutral-200 transition-colors disabled:opacity-50"
                              >
                                Sign In
                              </button>
                              <button 
                                onClick={handleSignUp}
                                disabled={authLoading}
                                className="flex-1 py-2.5 bg-[#212121] text-white border border-neutral-800 rounded-xl font-medium hover:bg-[#2f2f2f] transition-colors disabled:opacity-50"
                              >
                                Sign Up
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                  {activeModal === 'settings' && (
                    <div className="space-y-4">
                      <p className="text-sm text-neutral-400 mb-2">What would you like Echo to know about you to provide better responses?</p>
                      <textarea 
                        value={userContext}
                        onChange={(e) => setUserContext(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600 min-h-[120px]"
                        placeholder="e.g., I'm a software developer..."
                      />
                      <p className="text-sm text-neutral-400 mt-4 mb-2">How would you like Echo to respond?</p>
                      <textarea 
                        value={responseStyle}
                        onChange={(e) => setResponseStyle(e.target.value)}
                        className="w-full bg-[#212121] border border-neutral-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-neutral-600 min-h-[120px]"
                        placeholder="e.g., Keep responses concise and use code examples..."
                      />
                      <p className="text-sm text-neutral-400 mt-4 mb-2">Theme</p>
                      <div className="flex bg-[#212121] p-1 rounded-xl border border-neutral-800">
                        {(['light', 'dark', 'system'] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setTheme(t)}
                            className={`flex-1 py-2 text-sm rounded-lg capitalize ${theme === t ? 'bg-lime-500 text-black font-medium' : 'text-neutral-400 hover:text-white'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={saveSettings}
                        className="w-full py-3 bg-lime-500 text-black rounded-xl font-medium hover:bg-lime-400 transition-colors mt-4"
                      >
                        Save Settings
                      </button>
                    </div>
                  )}
                  {activeModal === 'data' && (
                    <div className="space-y-6 text-sm text-neutral-300">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium mb-1">Chat History & Training</p>
                          <p className="text-xs text-neutral-500">Save new chats to your history and allow them to be used to improve our models.</p>
                        </div>
                        <div className="w-10 h-6 bg-emerald-500 rounded-full relative cursor-pointer shrink-0 ml-4">
                          <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                        </div>
                      </div>
                      <div className="pt-4 border-t border-neutral-800">
                        <button className="text-white font-medium hover:underline">Export Data</button>
                        <p className="text-xs text-neutral-500 mt-1">Get a copy of your data sent to your email.</p>
                      </div>
                      <div className="pt-4 border-t border-neutral-800">
                        <button className="text-red-500 font-medium hover:underline">Delete Account</button>
                        <p className="text-xs text-neutral-500 mt-1">Permanently delete your account and all data.</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Explore Apps Screen */}
        <AnimatePresence>
          {isAppsOpen && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-0 bg-[#0a0a0a] z-[60] flex flex-col"
            >
              <div className="flex items-center p-4 border-b border-neutral-800">
                <button 
                  onClick={() => setIsAppsOpen(false)}
                  className="p-2 text-white hover:bg-[#212121] rounded-full mr-2"
                >
                  <ChevronLeft size={24} />
                </button>
                <h2 className="text-lg font-semibold">Explore Apps</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div 
                  onClick={() => { triggerAction('Help me write a marketing copy for...'); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-xl">✍️</div>
                  <div>
                    <h3 className="font-medium">Copywriter</h3>
                    <p className="text-xs text-neutral-400">Generate marketing copy</p>
                  </div>
                </div>
                <div 
                  onClick={() => { triggerAction('Debug this code for me: '); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-xl">💻</div>
                  <div>
                    <h3 className="font-medium">Code Guru</h3>
                    <p className="text-xs text-neutral-400">Debug and write software</p>
                  </div>
                </div>
                <div 
                  onClick={() => { triggerAction('Create a creative image of...'); setIsAppsOpen(false); }}
                  className="bg-[#1a1a1a] p-4 rounded-2xl flex items-center space-x-4 hover:bg-[#252525] transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-xl">🎨</div>
                  <div>
                    <h3 className="font-medium">Artisan</h3>
                    <p className="text-xs text-neutral-400">Creative image generation</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Camera Overlay */}
        <AnimatePresence>
          {isCameraOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black z-[100] flex flex-col"
            >
              <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                <div className="absolute top-6 left-6 right-6 flex justify-between items-center z-10">
                  <button 
                    onClick={stopCamera}
                    className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                  >
                    <X size={20} />
                  </button>
                  <button 
                    onClick={switchCamera}
                    className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              </div>
              
              <div className="h-32 bg-black flex items-center justify-center px-10">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center p-1"
                >
                  <div className="w-full h-full rounded-full border-4 border-black bg-white"></div>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Attachment Bottom Sheet */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                className="absolute inset-0 bg-black/60 z-30"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 w-full bg-[#1a1a1a] rounded-t-[28px] z-40 flex flex-col pb-6 px-4"
              >
                <div className="w-full flex justify-center pt-3 pb-5">
                  <div className="w-10 h-1 bg-[#444] rounded-full"></div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <button 
                    onClick={startCamera}
                    className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors"
                  >
                    <Camera size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Camera</span>
                  </button>
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                    <ImageIcon size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Photos</span>
                  </label>
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" className="hidden" onChange={handleFileUpload} />
                    <FileText size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Files</span>
                  </label>
                </div>

                <div className="w-full h-px bg-[#333] my-2"></div>

                <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col pt-2 max-h-[40vh]">
                  <button 
                    onClick={() => triggerAction('Create an image of...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Create image</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Visualize anything</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Search the web for recent news regarding...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Web search</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Find real-time news and info</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Teach me a new concept about...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Study and learn</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Learn a new concept</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => triggerAction('Activate agent mode to help me format...')}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><path d="M12 7v4"></path></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Agent mode</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Get work done for you</div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={() => { setIsMenuOpen(false); setIsAppsOpen(true); }}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl text-left transition-colors"
                  >
                    <div className="w-6 flex justify-center text-white"><svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Explore apps</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
