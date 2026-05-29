'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, BarChart2, TrendingUp, UserPlus, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function formatMessage(text: string) {
  // Simple markdown-like formatting
  let html = text
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-gray-900 rounded p-2 my-1 text-xs overflow-x-auto"><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-gray-900 px-1 py-0.5 rounded text-xs text-red-300">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Bullet lists
    .replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
    // Numbered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    // Line breaks
    .replace(/\n/g, '<br/>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li><br\/>?)+)/g, (match) => {
    const cleaned = match.replace(/<br\/>/g, '');
    return `<ul class="my-1">${cleaned}</ul>`;
  });

  return html;
}

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  // Speech-to-text
  const toggleListening = useCallback(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser. Try Chrome.');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript);
      // Auto-send when speech is final
      if (event.results[event.results.length - 1].isFinal) {
        setTimeout(() => {
          setIsListening(false);
        }, 500);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  // Text-to-speech via ElevenLabs
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string) => {
    if (!ttsEnabled) return;
    try {
      setIsSpeaking(true);
      const res = await fetch('/api/admin/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) { setIsSpeaking(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsSpeaking(false); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }, [ttsEnabled]);

  // Stop speaking when chat closes or TTS toggled off
  useEffect(() => {
    if (!isOpen || !ttsEnabled) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsSpeaking(false);
    }
  }, [isOpen, ttsEnabled]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: 'user', content: messageText };
    const newMessages = [...messages, userMessage].slice(-20);
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Error: ${data.error}` },
        ]);
      } else {
        const response = data.response;
        setMessages((prev) =>
          [...prev, { role: 'assistant', content: response }].slice(-20)
        );
        speak(response);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to reach AI service. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { label: 'Revenue', query: 'What\'s our revenue looking like this month?', icon: TrendingUp },
    { label: 'Pipeline', query: 'Show me the current job pipeline summary', icon: BarChart2 },
    { label: 'Leads Today', query: 'How many new leads came in today?', icon: UserPlus },
  ];

  // Collapsed button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg shadow-red-900/30 transition-all duration-200 hover:scale-105 group"
      >
        <Sparkles className="w-5 h-5 animate-pulse" />
        <span className="text-sm font-semibold">AI</span>
      </button>
    );
  }

  // Expanded chat panel
  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="md:hidden fixed inset-0 z-50 bg-black/60"
        onClick={() => setIsOpen(false)}
      />

      {/* Chat panel */}
      <div className="fixed z-50 bottom-0 right-0 md:bottom-6 md:right-6 w-full h-full md:w-[400px] md:h-[540px] md:rounded-xl bg-gray-800 border border-gray-700 shadow-2xl shadow-black/50 flex flex-col overflow-hidden md:max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white leading-tight">AI Assistant</h3>
              <p className="text-[10px] text-gray-500 leading-tight">Claude Haiku</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { if (isSpeaking && audioRef.current) { audioRef.current.pause(); audioRef.current = null; setIsSpeaking(false); } setTtsEnabled(!ttsEnabled); }}
              className={`p-1.5 rounded-lg transition-colors ${ttsEnabled ? 'text-red-400 bg-red-600/20' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
              title={ttsEnabled ? 'Voice responses ON' : 'Voice responses OFF'}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-12 h-12 rounded-xl bg-red-600/10 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm text-gray-400 mb-1">Roof Works AI Assistant</p>
              <p className="text-xs text-gray-500 max-w-[260px]">
                Ask me anything about your business — metrics, customers, jobs, revenue, or take actions.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-red-600 text-white rounded-br-sm'
                    : 'bg-gray-700 text-gray-200 rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />
                ) : (
                  <span>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-700 rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" />
                <span className="text-xs text-gray-400">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick actions */}
        {messages.length === 0 && (
          <div className="px-4 pb-2 flex gap-2 flex-shrink-0">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => sendMessage(action.query)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700/60 hover:bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-300 hover:text-white transition-colors disabled:opacity-50"
              >
                <action.icon className="w-3 h-3" />
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-3 py-3 border-t border-gray-700 flex-shrink-0 bg-gray-800/80">
          {isListening && (
            <div className="flex items-center gap-2 mb-2 px-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-red-400">Listening... speak now</span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={toggleListening}
              disabled={isLoading}
              className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                isListening
                  ? 'bg-red-600 text-white animate-pulse'
                  : 'bg-gray-700 text-gray-400 hover:text-white hover:bg-gray-600'
              } disabled:opacity-50`}
              title={isListening ? 'Stop listening' : 'Voice input'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isListening ? 'Listening...' : 'Ask anything...'}
              rows={1}
              disabled={isLoading}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 disabled:opacity-50 max-h-[120px]"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="p-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-white transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
