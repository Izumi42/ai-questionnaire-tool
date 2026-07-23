import React, { useEffect, useRef } from "react";

/**
 * Props for the AudioVisualizer component.
 * @property stream - The live MediaStream (microphone) to analyze.
 * @property isActive - Whether the visualizer should actively animate. 
 *                      If false, the canvas clears and the animation loop stops.
 */
interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

/**
 * A highly optimized, vanilla HTML5 Canvas based audio visualizer.
 * It utilizes the Web Audio API's AnalyserNode to extract real-time frequency data
 * from the microphone stream, rendering a set of smooth bars that react to volume/pitch.
 */
export function AudioVisualizer({ stream, isActive }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafIdRef = useRef<number>(0);

  useEffect(() => {
    if (!stream || !isActive) {
      // Clear canvas if inactive
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Handle high DPI displays for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // ---------------------------------------------------------
    // Web Audio API Setup
    // ---------------------------------------------------------
    // 1. Create a new AudioContext (handling cross-browser prefixes)
    const WindowType = window as unknown as { webkitAudioContext: typeof AudioContext };
    const audioCtx = new (window.AudioContext || WindowType.webkitAudioContext)();
    audioCtxRef.current = audioCtx;

    // 2. Create the AnalyserNode to extract frequency data
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64; // Smaller fftSize = fewer frequency bins, which is perfect for a simple UI visualizer
    analyzerRef.current = analyser;

    // 3. Connect the live microphone stream to the analyser
    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;
    source.connect(analyser);

    // 4. Prepare a Uint8Array to receive the frequency data payload on each frame
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // ---------------------------------------------------------
    // Canvas Render Loop
    // ---------------------------------------------------------

    const draw = () => {
      rafIdRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, rect.width, rect.height);

      const numBars = 12;
      const barWidth = 3;
      const spacing = 2;
      const startX = (rect.width - (numBars * barWidth + (numBars - 1) * spacing)) / 2;

      for (let i = 0; i < numBars; i++) {
        // Map 0-255 frequency data to a reasonable height
        const value = dataArray[i + 2] || 0; // Skip lowest frequencies for cleaner look
        const percent = value / 255;
        const height = Math.max(2, percent * rect.height * 0.8);

        ctx.fillStyle = isActive ? "#6366f1" : "#475569"; // indigo-500 or slate-600
        
        // Draw centered vertically
        const y = (rect.height - height) / 2;
        ctx.beginPath();
        ctx.roundRect(startX + i * (barWidth + spacing), y, barWidth, height, 2);
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafIdRef.current);
      if (sourceRef.current) sourceRef.current.disconnect();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(console.error);
      }
    };
  }, [stream, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-16 h-6"
      style={{ display: "block" }}
    />
  );
}
