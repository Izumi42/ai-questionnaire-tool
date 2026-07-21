# AI Questionnaire Tool & Interview Co-pilot

A real-time, privacy-first AI assistant designed to sit alongside you during live interviews (via Google Meet, Zoom, etc.) and provide instant insights, automated agenda tracking, and smart follow-up questions.

Built with **Next.js**, **Deepgram (Nova-2)**, and **Groq (LLaMA 3.3 70B)**.

## Features

- 🎙️ **Dual-Stream Audio Capture**: Captures both your microphone and the candidate's browser audio (via screen share tab audio) directly in the browser.
- ⚡ **Real-Time Transcription**: Utilizes Deepgram's multi-channel WebSocket API to transcribe and perfectly separate speakers in real-time.
- 🧠 **Live AI Insights**: Groq's LLaMA 3.3 analyzes the live transcript to suggest probing follow-up questions, highlight red flags, and provide insights.
- 📝 **Context Injection**: Paste the candidate's resume and job description into the "Pre-Flight Setup" panel before starting. The AI will use this context to cross-reference their answers!
- ✅ **Smart Auto-Agenda**: Add a checklist of mandatory topics. As you conduct the interview, the AI actively listens and automatically checks off items once it determines the topic has been sufficiently covered.
- 🪟 **Picture-in-Picture (PiP)**: Pop out the AI insights into a floating native browser window that stays on top of Google Meet, meaning you never have to switch tabs and break eye contact.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS, Framer Motion
- **APIs**: Web Audio API, Document Picture-in-Picture API
- **AI/LLMs**: 
  - [Deepgram](https://deepgram.com/) (Live Transcription WebSocket)
  - [Groq](https://groq.com/) (Ultra-fast LLM Inference - `llama-3.3-70b-versatile`)

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/ai-questionnaire-tool.git
cd ai-questionnaire-tool
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file in the root directory and add your API keys:
```env
NEXT_PUBLIC_DEEPGRAM_API_KEY=your_deepgram_key_here
GROQ_API_KEY=your_groq_key_here
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your Chrome or Edge browser.

## Usage Guide
1. **Pre-Flight:** Paste the candidate's Resume and Job Description into the left panel. Add any required questions to the Smart Agenda.
2. **Start Listening:** Click "Start Listening". When the browser prompts you to share your screen, select the tab where your meeting is happening and **ENSURE "Share tab audio" is checked**.
3. **Pop Out:** Click "Pop Out Overlay" in the top right to float the AI suggestions directly over your meeting window.
4. **Conduct Interview:** Talk normally. The AI will generate insights and check off your agenda automatically!

## License
MIT
