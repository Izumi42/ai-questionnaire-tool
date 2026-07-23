"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, User, HandHeart, AlertCircle, HelpCircle, MonitorUp, Star, Download, X, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { analyzeTranscriptClient } from "@/lib/groqClient";

export default function Home() {
  // --- Core State ---
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{ id: string, text: string, speaker: "candidate" | "interviewer" }[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [interviewFocus, setInterviewFocus] = useState("Software Engineering");
  
  // --- Refs for audio processing & real-time connections ---
  const transcriptRef = useRef<{ id: string, text: string, speaker: "candidate" | "interviewer" }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  // --- AI State ---
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // --- UI & Environment State ---
  const [apiError, setApiError] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  // Evaluation States
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [manualRating, setManualRating] = useState<number>(0);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);

  // API Key States
  const [groqApiKey, setGroqApiKey] = useState("");
  const [deepgramApiKey, setDeepgramApiKey] = useState("");

  useEffect(() => {
    setGroqApiKey(localStorage.getItem("groqApiKey") || "");
    setDeepgramApiKey(localStorage.getItem("deepgramApiKey") || "");
  }, []);

  // --- Pre-Flight Context State ---
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [agendaItems, setAgendaItems] = useState<{ id: string, text: string, checked: boolean }[]>([]);
  const [newAgenda, setNewAgenda] = useState("");
  
  // Auto-scroll anchor
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, currentText]);

  // O(1) Latest context reference to prevent stale closures without infinite re-renders
  const contextRef = useRef({ resumeText, jobDescription, agendaItems, interviewFocus, suggestions, groqApiKey, deepgramApiKey });
  useEffect(() => {
    contextRef.current = { resumeText, jobDescription, agendaItems, interviewFocus, suggestions, groqApiKey, deepgramApiKey };
  }, [resumeText, jobDescription, agendaItems, interviewFocus, suggestions, groqApiKey, deepgramApiKey]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    let micStream: MediaStream | null = null;
    let screenStream: MediaStream | null = null;
    let isRecordingActive = isRecording;

    const startRecording = async () => {
      if (!isRecordingActive) return;

      try {
        // 1. Get Screen Audio (Google Meet)
        screenStream = await navigator.mediaDevices.getDisplayMedia({ 
          video: true, 
          audio: true 
        });

        // 2. Get Microphone Audio (User)
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // 3. Mix the streams into Stereo (Left = Mic, Right = Screen)
        const audioCtx = new window.AudioContext();
        audioCtxRef.current = audioCtx;
        
        const merger = audioCtx.createChannelMerger(2);
        
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(merger, 0, 0); // Connect mic to Left channel (0)

        if (screenStream.getAudioTracks().length > 0) {
          const screenSource = audioCtx.createMediaStreamSource(screenStream);
          screenSource.connect(merger, 0, 1); // Connect meet to Right channel (1)
        } else {
          setApiError("Warning: No tab audio detected. Make sure to check 'Share tab audio'.");
        }

        const dest = audioCtx.createMediaStreamDestination();
        dest.channelCount = 2; // Ensure destination stays stereo
        merger.connect(dest);

        // 4. Setup Deepgram WebSocket
        const apiKey = contextRef.current.deepgramApiKey || process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
        if (!apiKey) {
          setApiError("Deepgram API Key is missing! Please add it in the setup panel.");
          setIsRecording(false);
          return;
        }

        const socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true&filler_words=false&multichannel=true&channels=2', [
          'token',
          apiKey
        ]);
        socketRef.current = socket;

        socket.onopen = () => {
          // Force stereo encoding in Chrome to prevent downmixing to mono
          const mediaRecorder = new MediaRecorder(dest.stream, {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 128000
          });
          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && socket.readyState === 1) {
              socket.send(e.data);
            }
          };

          // Send 250ms chunks to WebSocket instantly
          mediaRecorder.start(250);
        };

        socket.onmessage = (message) => {
          try {
            const received = JSON.parse(message.data);
            if (received.channel && received.channel.alternatives && received.channel.alternatives[0]) {
              const transcriptStr = received.channel.alternatives[0].transcript;
              
              // Handle Deepgram returning channel_index as an array [input, output] or integer
              const channelIdx = Array.isArray(received.channel_index) ? received.channel_index[0] : received.channel_index;
              
              // channel 0 is the microphone (User/Interviewer), channel 1 is the screen audio (Candidate)
              const speaker = channelIdx === 0 ? "interviewer" : "candidate";
              
              if (transcriptStr) {
                if (received.is_final) {
                  const id = crypto.randomUUID();
                  setTranscript(prev => [...prev, { id, text: transcriptStr.trim(), speaker }]);
                  setCurrentText("");
                } else {
                  setCurrentText(`${speaker === 'interviewer' ? 'You' : 'Candidate'}: ${transcriptStr}`);
                }
              }
            }
          } catch (e) {
            console.error("Failed to parse Deepgram message", e);
          }
        };

        socket.onerror = (e) => {
          console.error("Deepgram WebSocket Error", e);
          setApiError("Deepgram Connection Error. Check your API key.");
        };

        socket.onclose = () => {
          if (isRecordingActive) setIsRecording(false);
        };

        // Handle native screen share stop button
        screenStream.getVideoTracks()[0].onended = () => {
          setIsRecording(false);
        };

      } catch (err: any) {
        console.error("Failed to start recording streams", err);
        setApiError("Failed to access microphone or screen share. Please allow both.");
        setIsRecording(false);
      }
    };

    if (isRecordingActive) {
      startRecording();
    } else {
      isRecordingActive = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) socketRef.current.close();
      if (micStream) (micStream as any).getTracks().forEach((t: any) => t.stop());
      if (screenStream) (screenStream as any).getTracks().forEach((t: any) => t.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    }

    return () => {
      isRecordingActive = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) socketRef.current.close();
      if (micStream) (micStream as any).getTracks().forEach((t: any) => t.stop());
      if (screenStream) (screenStream as any).getTracks().forEach((t: any) => t.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [isRecording]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const togglePip = async () => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }

    if (!('documentPictureInPicture' in window)) {
      setApiError("Your browser doesn't support Document Picture-in-Picture. Please use Chrome 116+.");
      return;
    }

    try {
      const pip = await (window as any).documentPictureInPicture.requestWindow({
        width: 450,
        height: 600,
      });

      // Copy styles
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
          const style = document.createElement('style');
          style.textContent = cssRules;
          pip.document.head.appendChild(style);
        } catch (e) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.type = styleSheet.type;
          link.media = styleSheet.media.mediaText;
          if (styleSheet.href) link.href = styleSheet.href;
          pip.document.head.appendChild(link);
        }
      });

      // Base Tailwind classes for the body of the PiP window to match dark theme
      pip.document.body.className = "bg-slate-950 text-slate-100 font-sans p-6 selection:bg-indigo-500/30 overflow-hidden";

      pip.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(pip);
    } catch (err: any) {
      console.error(err);
      setApiError("Failed to open Picture-in-Picture window.");
    }
  };

  const resetSession = () => {
    if (isRecording) {
      setIsRecording(false);
    }
    setTranscript([]);
    setAgendaItems([]);
    setSuggestions([]);
    setResumeText("");
    setJobDescription("");
    setCurrentText("");
    setManualRating(0);
    setShowEvaluation(false);
    setShowNewSessionModal(false);
  };

  const handleNewSessionClick = () => {
    if (transcript.length > 0) {
      setShowNewSessionModal(true);
    } else {
      resetSession();
    }
  };

  const handleSaveAndReset = () => {
    exportToMarkdown();
    resetSession();
  };

  // Analyze transcript when it changes (debounced)
  useEffect(() => {
    if (transcript.length === 0) return;

    const analyzeTranscript = async () => {
      const apiKey = contextRef.current.groqApiKey || process.env.NEXT_PUBLIC_GROQ_API_KEY;
      if (!apiKey) {
        setApiError("Groq API Key is missing! Please add it in the setup panel.");
        return;
      }
      setIsAnalyzing(true);
      setApiError(null);
      try {
        const data = await analyzeTranscriptClient({
          apiKey,
          transcript: transcript.slice(-10),
          focus: contextRef.current.interviewFocus,
          resume: contextRef.current.resumeText,
          jobDescription: contextRef.current.jobDescription,
          agendaItems: contextRef.current.agendaItems.filter(item => !item.checked),
          currentSuggestions: contextRef.current.suggestions.map((s: any) => s.text)
        });
        
        if (data.suggestions && data.suggestions.length > 0) {
          setSuggestions(prev => [...prev, ...data.suggestions].slice(-5));
        } else {
          setApiError("AI returned no suggestions.");
        }
        if (data.completed_agenda_ids && data.completed_agenda_ids.length > 0) {
          const completedSet = new Set(data.completed_agenda_ids);
          setAgendaItems(prev => prev.map(item => 
            completedSet.has(item.id) ? { ...item, checked: true } : item
          ));
        }
      } catch (error: any) {
        console.error("Analysis Error:", error);
        setApiError(`API Error: ${error.message || error.toString()}`);
      } finally {
        setIsAnalyzing(false);
      }
    };

    const timer = setTimeout(() => {
      analyzeTranscript();
    }, 3000); // Wait 3 seconds after they stop talking to analyze

    return () => clearTimeout(timer);
  }, [transcript, interviewFocus]);

  const exportToMarkdown = () => {
    let content = `# Interview Evaluation & Transcript\n\n`;
    content += `**Focus Area:** ${interviewFocus}\n`;
    content += `**Date:** ${new Date().toLocaleDateString()}\n\n`;
    
    if (manualRating > 0) {
      content += `## Interviewer Manual Rating\n`;
      content += `${manualRating} / 5 Stars\n\n`;
    }

    content += `## Full Transcript\n\n`;
    transcript.forEach(msg => {
      const speaker = msg.speaker === 'candidate' ? 'Candidate' : 'Interviewer';
      content += `**${speaker}:** ${msg.text}\n\n`;
    });

    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'follow-up': return <HelpCircle className="w-5 h-5 text-blue-400" />;
      case 'red-flag': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'insight':
      default:
        return <AlertCircle className="w-5 h-5 text-amber-400" />;
    }
  };

  const insightsContent = (
    <div className="flex flex-col h-full bg-transparent z-10 w-full relative">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-6 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.8)]"></div>
        <h2 className="text-lg font-semibold text-slate-200 font-display">AI Insights & Questions</h2>
        {isAnalyzing && (
          <span className="ml-auto text-xs text-indigo-400 animate-pulse font-medium">Analyzing...</span>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        
        {/* Agenda Section */}
        <div className="mb-6 p-5 rounded-2xl glass-panel relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center justify-between">
            Smart Agenda 
            <span className="text-xs font-normal text-slate-500">{agendaItems.filter(i => i.checked).length}/{agendaItems.length} completed</span>
          </h3>
          <div className="space-y-3">
            {agendaItems.map(item => (
              <div key={item.id} className="flex items-start gap-3 group">
                <button 
                  onClick={() => setAgendaItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${item.checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600 hover:border-slate-400'}`}
                >
                  {item.checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className={`text-sm flex-1 ${item.checked ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{item.text}</span>
                <button 
                  onClick={() => setAgendaItems(prev => prev.filter(i => i.id !== item.id))}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-red-400 flex-shrink-0 ml-1"
                  title="Delete question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            
            {/* Add new agenda item input */}
            {!isRecording && transcript.length === 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                <input 
                  type="text" 
                  value={newAgenda}
                  onChange={(e) => setNewAgenda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newAgenda.trim()) {
                      setAgendaItems(prev => [...prev, { id: Date.now().toString(), text: newAgenda.trim(), checked: false }]);
                      setNewAgenda("");
                    }
                  }}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Add question (press Enter)"
                />
              </div>
            )}
          </div>
        </div>

        {apiError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{apiError}</p>
          </div>
        )}
        
        {suggestions.length === 0 && !isAnalyzing && !apiError && (
          <div className="text-sm text-slate-500 italic text-center mt-10">
            Listening to the conversation... Insights will appear here.
          </div>
        )}
        
        {suggestions.map((suggestion, i) => (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: i * 0.15 }}
            key={i} 
            onClick={() => {
              setAgendaItems(prev => {
                if (prev.some(item => item.text === suggestion.text)) return prev;
                return [...prev, { id: `click-${Date.now()}`, text: suggestion.text, checked: false }];
              });
              setSuggestions(prev => prev.filter(s => s.text !== suggestion.text));
            }}
            className="group p-5 rounded-2xl glass-panel bg-slate-800/20 hover:bg-slate-800/40 hover:border-white/20 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-1 hover:shadow-indigo-500/10"
          >
            {/* Subtle highlight effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <div className="flex items-start gap-4 relative z-10">
              <div className="mt-0.5 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50 flex-shrink-0">
                {getIconForType(suggestion.type)}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  {suggestion.type.replace('-', ' ')}
                </h3>
                <p className="text-sm text-slate-200 leading-relaxed font-medium">
                  {suggestion.text}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-4 glass-panel border-b border-white/5 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
            <HandHeart className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 font-display">Insight.io</h1>
            <p className="text-xs text-indigo-400 font-medium tracking-wide uppercase">Live Copilot</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors shadow-inner ${isRecording ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900/80 border-white/10 text-slate-300'}`}>
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-slate-600'}`}></div>
            {isRecording ? 'Listening...' : 'Standby'}
          </div>
          <div className="flex items-center gap-4">
          <select 
            value={interviewFocus}
            onChange={(e) => setInterviewFocus(e.target.value)}
            className="bg-slate-900/80 backdrop-blur-sm border border-white/10 text-slate-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none transition-colors shadow-inner"
          >
            <option value="Software Engineering">Software Engineering</option>
            <option value="Product Management">Product Management</option>
            <option value="Behavioral / Leadership">Behavioral / Leadership</option>
            <option value="Sales / Customer Success">Sales / Customer Success</option>
            <option value="Executive / C-Suite">Executive / C-Suite</option>
          </select>
          
          <button onClick={togglePip} className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors flex items-center gap-2 ${pipWindow ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
            <MonitorUp className="w-4 h-4" />
            {pipWindow ? 'Close Overlay' : 'Pop Out Overlay'}
          </button>
          <button onClick={handleNewSessionClick} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition-colors">
            New Session
          </button>
        </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen"></div>
        <div className="absolute bottom-0 right-1/4 w-[700px] h-[700px] bg-purple-600/15 rounded-full blur-[150px] pointer-events-none mix-blend-screen"></div>
        <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none -translate-x-1/2 -translate-y-1/2 mix-blend-screen"></div>

        {/* Left Column: Live Transcript */}
        <div className="flex flex-col w-2/3 border-r border-white/5 p-6 z-10 relative">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                Live Transcript
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Audio is captured continuously. The AI will determine the speaker based on context.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {!isRecording && transcript.length > 0 && (
                <button
                  onClick={() => setShowEvaluation(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                >
                  Finish & Evaluate
                </button>
              )}
              <button 
                onClick={(e) => {
                  toggleRecording();
                  e.currentTarget.blur();
                }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg ${
                  isRecording 
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 shadow-red-500/10' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording ? 'Stop Listening' : (transcript.length > 0 ? 'Resume Listening' : 'Start Listening')}
              </button>
            </div>
          </div>
          
          {!isRecording && transcript.length === 0 ? (
            <div className="flex-1 overflow-y-auto pr-4 space-y-6">
              <div className="p-8 glass-panel rounded-3xl relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
                <h3 className="text-xl font-semibold text-slate-100 mb-2 font-display">Pre-Flight Setup</h3>
                <p className="text-sm text-slate-400 mb-8">Provide context below to get hyper-personalized AI insights during the interview.</p>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-xl border border-red-500/20">
                    <div>
                      <label className="block text-sm font-medium text-red-300 mb-2 flex items-center gap-2">
                        Groq API Key <span className="text-xs font-normal text-red-400/70">(Required)</span>
                      </label>
                      <input 
                        type="password"
                        value={groqApiKey}
                        onChange={(e) => {
                          setGroqApiKey(e.target.value);
                          localStorage.setItem("groqApiKey", e.target.value);
                        }}
                        className="w-full bg-slate-950/80 border border-red-500/30 rounded-lg p-2.5 text-sm text-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                        placeholder="gsk_..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-red-300 mb-2 flex items-center gap-2">
                        Deepgram API Key <span className="text-xs font-normal text-red-400/70">(Required)</span>
                      </label>
                      <input 
                        type="password"
                        value={deepgramApiKey}
                        onChange={(e) => {
                          setDeepgramApiKey(e.target.value);
                          localStorage.setItem("deepgramApiKey", e.target.value);
                        }}
                        className="w-full bg-slate-950/80 border border-red-500/30 rounded-lg p-2.5 text-sm text-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                        placeholder="Live transcription key..."
                      />
                    </div>
                    <p className="text-xs text-red-400/80 md:col-span-2">
                      Keys are saved locally in your browser. This app runs 100% client-side so your keys are sent directly to Groq/Deepgram.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      Candidate Resume <span className="text-xs font-normal text-slate-500">(Optional)</span>
                    </label>
                    <textarea 
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      className="w-full bg-slate-950/50 backdrop-blur-md border border-white/10 rounded-xl p-4 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none h-32 transition-all resize-none shadow-inner"
                      placeholder="Paste the candidate's resume or LinkedIn profile here..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      Job Description <span className="text-xs font-normal text-slate-500">(Optional)</span>
                    </label>
                    <textarea 
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="w-full bg-slate-950/50 backdrop-blur-md border border-white/10 rounded-xl p-4 text-sm text-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none h-28 transition-all resize-none shadow-inner"
                      placeholder="Paste the job description or role requirements here..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {transcript.map((msg) => {
                const isInterviewer = msg.speaker === 'interviewer';
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    key={msg.id} 
                    className={`flex flex-col ${isInterviewer ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`flex items-center gap-2 mb-1.5 px-1 ${isInterviewer ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {isInterviewer ? 'You' : 'Candidate'}
                      </span>
                      {isInterviewer ? <User className="w-3 h-3 text-slate-500" /> : <MonitorUp className="w-3 h-3 text-indigo-400" />}
                    </div>
                    <div className={`px-5 py-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed border ${
                      isInterviewer 
                        ? 'bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-md text-slate-200 border-white/5 shadow-lg rounded-tr-sm' 
                        : 'bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-md text-indigo-50 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.15)] rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </motion.div>
                );
              })}
              
              {/* Interim Transcript (currently spoken text) */}
              {currentText && (
                <div className="flex flex-col items-start opacity-70">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Hearing...
                    </span>
                  </div>
                  <div className="px-5 py-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed shadow-sm bg-slate-800/30 text-slate-300 border border-slate-700/30 rounded-tl-sm italic">
                    {currentText}
                  </div>
                </div>
              )}
              
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* Right Column: AI Suggestions */}
        <div className="flex flex-col w-1/3 glass-panel border-y-0 border-r-0 border-white/5 p-6 z-10 bg-slate-950/40 backdrop-blur-2xl">
          {pipWindow ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4 opacity-60">
              <MonitorUp className="w-12 h-12" />
              <p className="text-sm font-medium">Insights are open in a Pop-Out Window.</p>
              <button onClick={togglePip} className="text-xs text-indigo-400 hover:text-indigo-300 underline">Bring back here</button>
            </div>
          ) : (
            insightsContent
          )}
          {pipWindow && createPortal(insightsContent, pipWindow.document.body)}
        </div>

      </main>

      {/* Evaluation Modal */}
      <AnimatePresence>
        {showEvaluation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel w-full max-w-3xl max-h-[90vh] rounded-3xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-slate-900/30">
                <h2 className="text-xl font-bold text-slate-100 font-display">Post-Interview Evaluation</h2>
                <button onClick={() => setShowEvaluation(false)} className="p-2 text-slate-400 hover:text-white transition-colors bg-slate-800/50 rounded-full hover:bg-slate-700/50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Manual Rating */}
                <div className="bg-slate-950/50 p-6 rounded-2xl border border-white/5 shadow-inner">
                  <h3 className="text-sm font-semibold text-slate-300 mb-4 uppercase tracking-wider">Your Rating</h3>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button 
                        key={star}
                        onClick={() => setManualRating(star)}
                        className="transition-transform hover:scale-110 focus:outline-none"
                      >
                        <Star className={`w-8 h-8 ${manualRating >= star ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-slate-500'}`} />
                      </button>
                    ))}
                    <span className="ml-4 text-sm font-medium text-slate-400">
                      {manualRating > 0 ? `${manualRating} out of 5 stars` : 'Select a rating'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <p className="text-xs text-slate-500">All data is processed securely.</p>
                <button 
                  onClick={exportToMarkdown}
                  className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-white text-slate-900 font-semibold rounded-xl transition-colors shadow-lg shadow-white/5"
                >
                  <Download className="w-4 h-4" />
                  Save & Export Chat
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Session Confirmation Modal */}
      <AnimatePresence>
        {showNewSessionModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-panel w-full max-w-md rounded-3xl overflow-hidden flex flex-col relative"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500"></div>
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-slate-900/30">
                <h2 className="text-xl font-bold text-slate-100">Start New Session</h2>
                <button onClick={() => setShowNewSessionModal(false)} className="p-2 text-slate-400 hover:text-slate-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 text-slate-300 text-sm">
                <p>Are you sure you want to start a new session? This will clear the current transcript, agenda, and context.</p>
                <p className="mt-2 text-indigo-300 font-medium">Would you like to save the current chat before resetting?</p>
              </div>
              <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex justify-end gap-3">
                <button 
                  onClick={resetSession}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-sm font-medium transition-colors"
                >
                  Discard & Reset
                </button>
                <button 
                  onClick={handleSaveAndReset}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                >
                  <Download className="w-4 h-4" />
                  Save & Reset
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
