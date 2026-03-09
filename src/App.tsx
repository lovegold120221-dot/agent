import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
  Code
} from 'lucide-react';
import { 
  generateChatResponse, 
  generateImage, 
  analyzeImage, 
  textToSpeech, 
  transcribeAudio,
  connectLive 
} from './services/gemini';

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
}

type ViewState = 'home' | 'chat';

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAppsOpen, setIsAppsOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  
  // Image options
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');

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
      
      const session = await connectLive({
        onopen: () => {
          console.log("Live session opened");
          setIsLiveActive(true);
        },
        onmessage: (message) => {
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
        onerror: (err) => console.error("Live error:", err),
        onclose: () => {
          console.log("Live session closed");
          stopLiveSession();
        }
      });

      liveSessionRef.current = session;

      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
        }
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        session.sendRealtimeInput({
          media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      streamRef.current = stream;
      processorRef.current = processor;

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

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const sendMessage = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;
    
    if (view === 'home') setView('chat');
    
    const userMessage: Message = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    setIsLoading(true);
    try {
      // Simple heuristic for image generation
      if (textToSend.toLowerCase().startsWith('create an image') || textToSend.toLowerCase().startsWith('generate an image')) {
        const isBasic = imageSize === '1K' && aspectRatio === '1:1';
        if (!isBasic && window.aistudio) {
          const hasKey = await window.aistudio.hasSelectedApiKey();
          if (!hasKey) {
            await window.aistudio.openSelectKey();
          }
        }
        const imageUrl = await generateImage(textToSend, imageSize, aspectRatio);
        if (imageUrl) {
          setMessages(prev => [...prev, { role: 'model', text: 'Here is your generated image:', image: imageUrl, isImageGen: true }]);
        }
      } else {
        const history = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));
        const response = await generateChatResponse(textToSend, history, isThinking, isFastMode);
        setMessages(prev => [...prev, { role: 'model', text: response.text || '' }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry, something went wrong.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setIsLoading(true);
          try {
            const transcription = await transcribeAudio(base64, 'audio/webm');
            if (transcription) {
              setInput(transcription);
              if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
              }
            }
          } catch (error) {
            console.error(error);
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
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
      
      setMessages(prev => [...prev, { role: 'user', text: `Analyzed ${file.name}`, image: event.target?.result as string }]);
      setIsLoading(true);
      try {
        const response = await analyzeImage("What is in this image?", base64, mimeType);
        setMessages(prev => [...prev, { role: 'model', text: response || '' }]);
      } catch (error) {
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
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
            <button className="w-9 h-9 flex items-center justify-center text-neutral-300 hover:text-white rounded-full">
              <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="6" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="18" r="1.5"></circle></svg>
            </button>
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
                <div className="mb-6">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e5e5e5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                    <line x1="12" y1="22.08" x2="12" y2="12"></line>
                  </svg>
                </div>
                <h1 className="text-[26px] font-semibold tracking-tight text-white mb-2">Echo</h1>
                <p className="text-xs font-medium text-neutral-400 mb-6">By codexxx host</p>
                <p className="text-base text-neutral-200">Eburon voice agent</p>
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
                          <div className="flex-1">
                            {msg.image && <img src={msg.image} alt="Generated" className="rounded-lg mb-2 max-w-full" referrerPolicy="no-referrer" />}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
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
              <Plus size={24} />
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

              <div className="flex items-center w-full pr-1">
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
                  className="flex-1 bg-transparent text-white placeholder-neutral-400 text-[15px] focus:outline-none pl-3 py-1.5 hide-scrollbar max-h-24" 
                  placeholder="Ask Echo AI"
                />
                
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
              <div className="p-6 flex justify-between items-center text-neutral-400 relative z-10">
                <span className="text-sm font-medium">{isLiveActive ? 'Listening...' : 'Connecting...'}</span>
                <button 
                  onClick={stopLiveSession}
                  className="p-2 bg-[#212121] rounded-full text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                <div className="flex items-center space-x-2 h-24">
                  {[...Array(5)].map((_, i) => (
                    <div 
                      key={i}
                      className={`w-2 bg-white rounded-full ${isLiveActive ? 'wave-bar' : ''}`}
                      style={{ height: '10px' }}
                    />
                  ))}
                </div>
                
                {liveTranscription && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 px-10 text-center"
                  >
                    <p className="text-white/60 text-sm italic line-clamp-2">
                      "{liveTranscription.trim()}"
                    </p>
                  </motion.div>
                )}
              </div>

              <div className="p-10 flex justify-center pb-20 relative z-10">
                <button 
                  onClick={stopLiveSession}
                  className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                >
                  <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2.586-2.586a2 2 0 012.828 0L24 8M6.586 17.414A2 2 0 008 18h8a2 2 0 001.414-.586l3.586-3.586a2 2 0 000-2.828l-3.586-3.586A2 2 0 0016 10H8a2 2 0 00-1.414.586l-3.586 3.586a2 2 0 000 2.828l3.586 3.586z"></path></svg>
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
                  <span className="font-semibold text-lg">Echo AI Settings</span>
                  <button onClick={() => setIsSidebarOpen(false)} className="text-neutral-400 hover:text-white">
                    <X size={24} />
                  </button>
                </div>
                <div className="flex-1 p-4 space-y-4">
                  <button className="w-full text-left p-3 rounded-xl hover:bg-[#212121] text-neutral-200 transition-colors">Account</button>
                  <button className="w-full text-left p-3 rounded-xl hover:bg-[#212121] text-neutral-200 transition-colors">Custom Instructions</button>
                  <button className="w-full text-left p-3 rounded-xl hover:bg-[#212121] text-neutral-200 transition-colors">Data Controls</button>
                </div>
              </motion.div>
            </>
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
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] py-4 flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                    <Camera size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Camera</span>
                  </label>
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
