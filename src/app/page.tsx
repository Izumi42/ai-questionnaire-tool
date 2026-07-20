"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Settings, User, Bot, AlertCircle, HelpCircle, MonitorUp } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState<{ role: "interviewer" | "candidate"; text: string }[]>([]);
  const [currentText, setCurrentText] = useState("");
  const [interviewFocus, setInterviewFocus] = useState("Software Engineering");
  const recognitionRef = useRef<any>(null);
  
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    // Initialize Web Speech API
    if (typeof window !== "undefined" && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
            
            // Add to main transcript array (defaulting to candidate for MVP)
            setTranscript(prev => [...prev, { role: "candidate", text: event.results[i][0].transcript.trim() }]);
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setCurrentText(interimTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          setIsRecording(false);
          alert("Microphone access is blocked. Please allow microphone access in your browser.");
        }
      };

      recognitionRef.current.onend = () => {
        // Auto-restart if we are still supposed to be recording
        if (isRecording) {
          recognitionRef.current.start();
        }
      };
    } else {
      alert("Speech Recognition API is not supported in this browser. Please use Google Chrome.");
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log("Already started");
      }
    } else if (!isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isRecording]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  // Analyze transcript when it changes (debounced)
  useEffect(() => {
    if (transcript.length === 0) return;

    const analyzeTranscript = async () => {
      setIsAnalyzing(true);
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            transcript: transcript.slice(-10),
            focus: interviewFocus
          }) // Send last 10 lines and current focus
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.suggestions && data.suggestions.length > 0) {
            setSuggestions(data.suggestions);
          }
        }
      } catch (error) {
        console.error("Failed to analyze transcript", error);
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

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">AI Co-pilot</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Interview Mode</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-sm font-medium text-slate-300">
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
          
          <button className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-slate-200">
            <Settings className="w-5 h-5" />
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
              <p className="text-sm text-slate-400 mt-1">Play meeting audio through speakers so the mic picks it up.</p>
            </div>
            
            <button 
              onClick={toggleRecording}
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
          
          <div className="flex-1 overflow-y-auto pr-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {transcript.map((msg, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                key={i} 
                className={`flex flex-col items-start`}
              >
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Speaker
                  </span>
                  <User className="w-3 h-3 text-slate-500" />
                </div>
                <div className="px-5 py-3.5 rounded-2xl max-w-[80%] text-sm leading-relaxed shadow-sm bg-slate-800/60 text-slate-200 border border-slate-700/50 rounded-tl-sm">
                  {msg.text}
                </div>
              </motion.div>
            ))}
            
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
        </div>

        {/* Right Column: AI Suggestions */}
        <div className="flex flex-col w-1/3 bg-slate-900/30 p-6 z-10">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2 h-6 rounded-full bg-indigo-500"></div>
            <h2 className="text-lg font-semibold text-slate-200">AI Insights & Questions</h2>
            {isAnalyzing && (
              <span className="ml-auto text-xs text-indigo-400 animate-pulse">Analyzing...</span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {suggestions.length === 0 && !isAnalyzing && (
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
                  <div className="mt-0.5 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
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

      </main>
    </div>
  );
}
