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
  Volume2,
  Zap,
  Radio,
  Square
} from 'lucide-react';
import { 
  generateChatResponse, 
  generateImage, 
  analyzeImage, 
  textToSpeech, 
  transcribeAudio,
  connectLive 
} from './services/gemini';

interface Message {
  role: 'user' | 'model';
  text: string;
  image?: string;
  audio?: string;
}

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isFastMode, setIsFastMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'chat' | 'image' | 'analyze'>('chat');
  const [isRecording, setIsRecording] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // Image options
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveSessionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const sendMessage = async () => {
    if (!input.trim() && mode !== 'analyze') return;
    
    const userMessage: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    
    setIsLoading(true);
    try {
      if (mode === 'image') {
        const imageUrl = await generateImage(currentInput, imageSize, aspectRatio);
        if (imageUrl) {
          setMessages(prev => [...prev, { role: 'model', text: 'Here is your generated image:', image: imageUrl }]);
        }
      } else {
        const history = messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }));
        const response = await generateChatResponse(currentInput, history, isThinking, isFastMode);
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

  const toggleLive = async () => {
    if (isLive) {
      if (liveSessionRef.current) {
        // Close session logic
        setIsLive(false);
      }
      return;
    }

    try {
      const session = await connectLive({
        onopen: () => {
          setIsLive(true);
          setMessages(prev => [...prev, { role: 'model', text: "Live session started. I'm listening..." }]);
        },
        onmessage: (msg) => {
          const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData) {
            const audio = new Audio(`data:audio/pcm;base64,${audioData}`);
            audio.play();
          }
        },
        onclose: () => setIsLive(false),
        onerror: (err) => console.error("Live error:", err),
      });
      liveSessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect live:", err);
    }
  };

  const playTTS = async (text: string) => {
    try {
      const audioUrl = await textToSpeech(text);
      if (audioUrl) {
        const audio = new Audio(audioUrl);
        audio.play();
      }
    } catch (err) {
      console.error("TTS error:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setIsMenuOpen(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex justify-center h-[100dvh] overflow-hidden bg-black font-sans">
      <div className="w-full max-w-md bg-black flex flex-col relative h-[100dvh] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <header className="flex justify-between items-center px-4 py-4 z-10">
          <button className="w-11 h-11 bg-[#212121] rounded-full flex items-center justify-center text-white hover:bg-[#2f2f2f] transition-colors">
            <Menu size={20} />
          </button>

          <div className="h-11 bg-[#212121] rounded-full flex items-center px-2 space-x-1">
            <button 
              onClick={() => setIsFastMode(!isFastMode)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isFastMode ? 'text-yellow-400 bg-yellow-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Fast Mode"
            >
              <Zap size={18} />
            </button>
            <button 
              onClick={() => setIsThinking(!isThinking)}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isThinking ? 'text-blue-400 bg-blue-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Thinking Mode"
            >
              <Brain size={20} className={isThinking ? 'animate-pulse' : ''} />
            </button>
            <button 
              onClick={toggleLive}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${isLive ? 'text-red-400 bg-red-400/10' : 'text-neutral-300 hover:text-white'}`}
              title="Live Voice"
            >
              <Radio size={18} className={isLive ? 'animate-pulse' : ''} />
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar px-4 py-4 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center pb-20">
              <div className="mb-6 text-neutral-200">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
              </div>
              <h1 className="text-[26px] font-semibold tracking-tight text-white mb-2">Echo</h1>
              <p className="text-xs font-medium text-neutral-400 mb-6">By codexxx host</p>
              <p className="text-base text-neutral-200">Eburon voice agent</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-3 ${msg.role === 'user' ? 'bg-[#212121] text-white' : 'text-neutral-200'}`}>
                  {msg.image && <img src={msg.image} alt="User upload" className="rounded-lg mb-2 max-w-full" referrerPolicy="no-referrer" />}
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  {msg.role === 'model' && msg.text && (
                    <button 
                      onClick={() => playTTS(msg.text)}
                      className="mt-2 p-1.5 hover:bg-white/10 rounded-full transition-colors text-neutral-400 hover:text-white"
                    >
                      <Volume2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex items-center space-x-2 text-neutral-400 text-sm">
              <Loader2 size={16} className="animate-spin" />
              <span>Echo is thinking...</span>
            </div>
          )}
        </main>

        {/* Bottom Input Area */}
        <footer className="px-4 pb-5 z-10 w-full flex flex-col space-y-2">
          {mode === 'image' && (
            <div className="flex items-center space-x-2 mb-2 px-2">
              <select 
                value={imageSize} 
                onChange={(e) => setImageSize(e.target.value as any)}
                className="bg-[#212121] text-white text-xs rounded-full px-3 py-1 outline-none border border-white/10"
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
              <select 
                value={aspectRatio} 
                onChange={(e) => setAspectRatio(e.target.value)}
                className="bg-[#212121] text-white text-xs rounded-full px-3 py-1 outline-none border border-white/10"
              >
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
              <button 
                onClick={() => setMode('chat')}
                className="text-xs text-neutral-400 hover:text-white ml-auto"
              >
                Cancel Image Mode
              </button>
            </div>
          )}

          <div className="flex items-end space-x-2">
            <button 
              onClick={() => setIsMenuOpen(true)}
              className="w-12 h-12 bg-[#212121] rounded-full flex items-center justify-center text-neutral-300 shrink-0 hover:bg-[#2f2f2f] transition-colors"
            >
              <Plus size={24} />
            </button>

            <div className="flex-1 bg-[#212121] rounded-[24px] flex flex-col justify-end p-2 relative min-h-[52px]">
              {isThinking && (
                <div className="bg-[#202936] text-[#4ba1ff] rounded-full px-3 py-1.5 flex items-center space-x-2 w-max mb-1.5 ml-1 mt-1">
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
                  placeholder={mode === 'image' ? "Describe the image..." : "Ask Echo AI"}
                />
                
                <button 
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  className={`w-10 h-10 flex items-center justify-center shrink-0 transition-colors ${isRecording ? 'text-red-500' : 'text-neutral-400 hover:text-white'}`}
                >
                  {isRecording ? <Square size={20} /> : <Mic size={20} />}
                </button>
                
                <button 
                  onClick={sendMessage}
                  disabled={isLoading}
                  className="w-[34px] h-[34px] bg-white rounded-full flex items-center justify-center shrink-0 ml-1 hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isLoading ? <Loader2 size={18} className="text-black animate-spin" /> : <Send size={18} className="text-black" />}
                </button>
              </div>
            </div>
          </div>
        </footer>

        {/* Bottom Sheet Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMenuOpen(false)}
                className="absolute inset-0 bg-black/60 z-40"
              />
              <motion.div 
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="absolute bottom-0 w-full bg-[#1a1a1a] rounded-t-[28px] z-50 flex flex-col max-h-[90vh] pb-6 px-4"
              >
                <div className="w-full flex justify-center pt-3 pb-5">
                  <div className="w-10 h-1 bg-[#444] rounded-full"></div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] aspect-square flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
                    <Camera size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Camera</span>
                  </label>
                  
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] aspect-square flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
                    <ImageIcon size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Photos</span>
                  </label>
                  
                  <label className="bg-[#2f2f2f] hover:bg-[#3a3a3a] rounded-[20px] aspect-square flex flex-col items-center justify-center space-y-2 transition-colors cursor-pointer">
                    <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
                    <FileText size={26} className="text-white" />
                    <span className="text-sm font-medium text-white">Files</span>
                  </label>
                </div>

                <div className="w-full h-px bg-[#333] my-2"></div>

                <div className="flex-1 overflow-y-auto hide-scrollbar flex flex-col pt-2">
                  <button 
                    onClick={() => { setMode('image'); setIsMenuOpen(false); }}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl transition-colors text-left"
                  >
                    <div className="w-6 flex justify-center text-white"><Grid size={24} /></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Create image</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Visualize anything</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setMode('chat'); setIsMenuOpen(false); }}
                    className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl transition-colors text-left"
                  >
                    <div className="w-6 flex justify-center text-white"><Search size={24} /></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Web search</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Find real-time news and info</div>
                    </div>
                  </button>

                  <button className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl transition-colors text-left">
                    <div className="w-6 flex justify-center text-white"><BookOpen size={24} /></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Study and learn</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Learn a new concept</div>
                    </div>
                  </button>

                  <button className="flex items-center space-x-4 py-4 px-2 hover:bg-[#2f2f2f] rounded-xl transition-colors text-left">
                    <div className="w-6 flex justify-center text-white"><Cpu size={24} /></div>
                    <div>
                      <div className="text-[15px] font-medium text-white">Agent mode</div>
                      <div className="text-[13px] text-neutral-400 mt-0.5">Get work done for you</div>
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
