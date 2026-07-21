"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Mic, MicOff, Settings, User, Bot, AlertCircle, HelpCircle, MonitorUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{ id: string, text: string, speaker: "candidate" | "interviewer" }[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [interviewFocus, setInterviewFocus] = useState("Software Engineering");
  const transcriptRef = useRef<{ id: string, text: string, speaker: "candidate" | "interviewer" }[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [agendaItems, setAgendaItems] = useState<{ id: string, text: string, checked: boolean }[]>([
    { id: "1", text: "Ask about system design experience", checked: false },
    { id: "2", text: "Discuss past conflict resolution", checked: false }
  ]);
  const [newAgenda, setNewAgenda] = useState("");

  // O(1) Latest context reference to prevent stale closures without infinite re-renders
  const contextRef = useRef({ resumeText, jobDescription, agendaItems, interviewFocus });
  useEffect(() => {
    contextRef.current = { resumeText, jobDescription, agendaItems, interviewFocus };
  }, [resumeText, jobDescription, agendaItems, interviewFocus]);

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
        const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;
        if (!apiKey) {
          setApiError("Deepgram API Key is missing in .env.local!");
          setIsRecording(false);
          return;
        }

        const socket = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-2&interim_results=true&smart_format=true&filler_words=false&multichannel=true', [
          'token',
          apiKey
        ]);
        socketRef.current = socket;

        socket.onopen = () => {
          const mediaRecorder = new MediaRecorder(dest.stream, {
            mimeType: "audio/webm",
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
              const speaker = received.channel_index === 1 ? "interviewer" : "candidate";
              
              if (transcriptStr) {
                if (received.is_final) {
                  const id = crypto.randomUUID();
                  setTranscript(prev => [...prev, { id, text: transcriptStr.trim(), speaker }]);
                  setCurrentText("");
                } else {
                  setCurrentText(`${speaker === 'interviewer' ? 'Interviewer' : 'You'}: ${transcriptStr}`);
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
      if (audioCtxRef.current) audioCtxRef.current.close();
    }

    return () => {
      isRecordingActive = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (socketRef.current) socketRef.current.close();
      if (micStream) (micStream as any).getTracks().forEach((t: any) => t.stop());
      if (screenStream) (screenStream as any).getTracks().forEach((t: any) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
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

  // Analyze transcript when it changes (debounced)
  useEffect(() => {
    if (transcript.length === 0) return;

    const analyzeTranscript = async () => {
      setIsAnalyzing(true);
      setApiError(null);
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            transcript: transcript.slice(-10),
            focus: contextRef.current.interviewFocus,
            resume: contextRef.current.resumeText,
            jobDescription: contextRef.current.jobDescription,
            agendaItems: contextRef.current.agendaItems.filter(item => !item.checked)
          }) // Send last 10 lines, context, and unchecked agenda
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
          } else {
            setApiError("AI returned no suggestions.");
          }
          if (data.completed_agenda_ids && data.completed_agenda_ids.length > 0) {
            // DSA Optimization: O(1) Set lookup instead of O(N) array includes
            const completedSet = new Set(data.completed_agenda_ids);
            setAgendaItems(prev => prev.map(item => 
              completedSet.has(item.id) ? { ...item, checked: true } : item
            ));
          }
        } else {
          try {
            const errorData = await response.json();
            setApiError(`API Error: ${errorData.error || response.statusText}`);
          } catch {
            setApiError(`API Error: ${response.status} ${response.statusText}`);
          }
        }
      } catch (error: any) {
        console.error("Failed to analyze transcript", error);
        setApiError("Failed to connect to AI server.");
      } finally {
        setIsAnalyzing(false);
      }
    };

    const timer = setTimeout(() => {
      analyzeTranscript();
    }, 3000); // Wait 3 seconds after they stop talking to analyze

    return () => clearTimeout(timer);
  }, [transcript, interviewFocus]);

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
    <div className="flex flex-col h-full bg-slate-950/30 z-10 w-full relative">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-2 h-6 rounded-full bg-indigo-500"></div>
        <h2 className="text-lg font-semibold text-slate-200">AI Insights & Questions</h2>
        {isAnalyzing && (
          <span className="ml-auto text-xs text-indigo-400 animate-pulse">Analyzing...</span>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
        
        {/* Agenda Section */}
        <div className="mb-6 p-4 rounded-xl bg-slate-800/20 border border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center justify-between">
            Smart Agenda 
            <span className="text-xs font-normal text-slate-500">{agendaItems.filter(i => i.checked).length}/{agendaItems.length} completed</span>
          </h3>
          <div className="space-y-3">
            {agendaItems.map(item => (
              <div key={item.id} className="flex items-start gap-3">
                <button 
                  onClick={() => setAgendaItems(prev => prev.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
                  className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${item.checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600 hover:border-slate-400'}`}
                >
                  {item.checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                </button>
                <span className={`text-sm ${item.checked ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{item.text}</span>
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
            className="group p-5 rounded-2xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/80 hover:border-slate-600 transition-all cursor-pointer backdrop-blur-sm relative overflow-hidden"
          >
            {/* Subtle highlight effect on hover */}
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
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
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">AI Questionnaire Tool</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Live Copilot</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${isRecording ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600'}`}></div>
            {isRecording ? 'Listening...' : 'Standby'}
          </div>
          <div className="flex items-center gap-4">
          <select 
            value={interviewFocus}
            onChange={(e) => setInterviewFocus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 outline-none transition-colors"
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
        </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 overflow-hidden relative">
        
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

        {/* Left Column: Live Transcript */}
        <div className="flex flex-col w-2/3 border-r border-slate-800/50 p-6 z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                Live Transcript
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Audio is captured continuously. The AI will determine the speaker based on context.
              </p>
            </div>
            
            <button 
              onClick={(e) => {
                toggleRecording();
                e.currentTarget.blur(); // Fixes the spacebar bug!
              }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg ${
                isRecording 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 shadow-red-500/10' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
              }`}
            >
              {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              {isRecording ? 'Stop Listening' : 'Start Listening'}
            </button>
          </div>
          
          {!isRecording && transcript.length === 0 ? (
            <div className="flex-1 overflow-y-auto pr-4 space-y-6">
              <div className="p-6 bg-slate-900/30 rounded-2xl border border-slate-800/50 shadow-inner">
                <h3 className="text-lg font-semibold text-slate-200 mb-2">Pre-Flight Setup</h3>
                <p className="text-sm text-slate-400 mb-6">Provide context below to get hyper-personalized AI insights during the interview.</p>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                      Candidate Resume <span className="text-xs font-normal text-slate-500">(Optional)</span>
                    </label>
                    <textarea 
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none h-32 scrollbar-thin scrollbar-thumb-slate-800 transition-colors resize-none"
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
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none h-24 scrollbar-thin scrollbar-thumb-slate-800 transition-colors resize-none"
                      placeholder="Paste the job description or role requirements here..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {transcript.map((msg) => {
                const isCandidate = msg.speaker === 'candidate';
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    key={msg.id} 
                    className={`flex flex-col ${isCandidate ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`flex items-center gap-2 mb-1.5 px-1 ${isCandidate ? 'flex-row-reverse' : ''}`}>
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
                        {isCandidate ? 'You' : 'Interviewer'}
                      </span>
                      {isCandidate ? <User className="w-3 h-3 text-slate-500" /> : <MonitorUp className="w-3 h-3 text-indigo-400" />}
                    </div>
                    <div className={`px-5 py-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed shadow-sm border ${
                      isCandidate 
                        ? 'bg-slate-800/60 text-slate-200 border-slate-700/50 rounded-tr-sm' 
                        : 'bg-indigo-500/10 text-indigo-100 border-indigo-500/20 rounded-tl-sm'
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

            </div>
          )}
        </div>

        {/* Right Column: AI Suggestions */}
        <div className="flex flex-col w-1/3 bg-slate-900/30 p-6 z-10 border-l border-slate-800/50">
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
    </div>
  );
}
