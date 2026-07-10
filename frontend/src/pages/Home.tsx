import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Search, 
  MoreVertical, 
  Phone, 
  Video, 
  Paperclip, 
  Smile, 
  Check, 
  CheckCheck,
  UserPlus,
  Server,
  Database,
  Lock,
  Share2,
  Rss,
  UserX,
  Cpu
} from 'lucide-react';
import './Home.css';

interface Message {
  id: string;
  sender: 'me' | 'them';
  content: string;
  time: string;
  status: 'sent' | 'delivered' | 'read';
}

interface Chat {
  id: string;
  name: string;
  avatar: string;
  status: string;
  lastMessage: string;
  time: string;
  isOnline: boolean;
  messages: Message[];
}

interface HomeProps {
  onAuthRequest?: () => void;
}

export default function Home({ onAuthRequest }: HomeProps) {
  const [chats, setChats] = useState<Chat[]>([
    {
      id: '1',
      name: 'Sarah Connor',
      avatar: 'SC',
      status: 'online',
      lastMessage: 'Let’s check the network gateway configurations tomorrow.',
      time: '12:45 PM',
      isOnline: true,
      messages: [
        { id: '1-1', sender: 'them', content: 'Hey! Did you review the schema changes?', time: '12:40 PM', status: 'read' },
        { id: '1-2', sender: 'me', content: 'Yes! The PostgreSQL junction table looks perfect.', time: '12:42 PM', status: 'read' },
        { id: '1-3', sender: 'them', content: 'Let’s check the network gateway configurations tomorrow.', time: '12:45 PM', status: 'read' }
      ]
    },
    {
      id: '2',
      name: 'Alex Rivera',
      avatar: 'AR',
      status: 'offline',
      lastMessage: 'Is the HTTP session cookie secure?',
      time: 'Yesterday',
      isOnline: false,
      messages: [
        { id: '2-1', sender: 'them', content: 'Is the HTTP session cookie secure?', time: 'Yesterday', status: 'read' }
      ]
    },
    {
      id: '3',
      name: 'Dev Channel',
      avatar: '🚀',
      status: '3 online',
      lastMessage: 'New release build is live!',
      time: '2 days ago',
      isOnline: true,
      messages: [
        { id: '3-1', sender: 'them', content: 'Testing socket connections.', time: '2 days ago', status: 'read' },
        { id: '3-2', sender: 'them', content: 'New release build is live!', time: '2 days ago', status: 'read' }
      ]
    }
  ]);

  const [activeChatId, setActiveChatId] = useState('1');
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages, isTyping]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      sender: 'me',
      content: inputText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };

    // Add message to current active chat
    setChats(prevChats => 
      prevChats.map(chat => {
        if (chat.id === activeChatId) {
          return {
            ...chat,
            lastMessage: inputText,
            time: 'Just now',
            messages: [...chat.messages, newMessage]
          };
        }
        return chat;
      })
    );

    const sentMessageId = newMessage.id;
    setInputText('');

    // Simulate WebSocket flow: Delivered -> Read -> auto reply with typing indicator
    setTimeout(() => {
      // Mark delivered
      setChats(prevChats => 
        prevChats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: chat.messages.map(m => m.id === sentMessageId ? { ...m, status: 'delivered' as const } : m)
            };
          }
          return chat;
        })
      );
    }, 1000);

    setTimeout(() => {
      // Mark read
      setChats(prevChats => 
        prevChats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              messages: chat.messages.map(m => m.id === sentMessageId ? { ...m, status: 'read' as const } : m)
            };
          }
          return chat;
        })
      );

      // Trigger user typing indicator
      setIsTyping(true);
    }, 2000);

    // Auto reply mock
    setTimeout(() => {
      setIsTyping(false);
      const replyMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        sender: 'them',
        content: `Got it! ConnectSphere websocket gateway processed that perfectly. ✨`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'read'
      };

      setChats(prevChats => 
        prevChats.map(chat => {
          if (chat.id === activeChatId) {
            return {
              ...chat,
              lastMessage: replyMessage.content,
              time: 'Just now',
              messages: [...chat.messages, replyMessage]
            };
          }
          return chat;
        })
      );
    }, 4500);
  };

  const renderStatusTicks = (status: 'sent' | 'delivered' | 'read') => {
    if (status === 'sent') return <Check size={14} className="ticks-sent" />;
    if (status === 'delivered') return <CheckCheck size={14} className="ticks-delivered" />;
    return <CheckCheck size={14} className="ticks-read" />;
  };

  return (
    <div className="landing-container">
      {/* Decorative Glowing Elements */}
      <div className="bg-glow glow-1"></div>
      <div className="bg-glow glow-2"></div>

      {/* Floating Header */}
      <header className="navbar glass">
        <a href="#" className="nav-brand">
          <MessageSquare size={26} style={{ color: 'var(--accent-primary)' }} />
          <span>ConnectSphere</span>
        </a>
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#demo" className="nav-link">Live Mockup</a>
          <a href="/uploads/img1.jpg" target="_blank" rel="noreferrer" className="nav-link">Architecture</a>
        </nav>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={onAuthRequest}>Sign In</button>
          <button className="btn btn-primary" onClick={onAuthRequest}>Launch App</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="badge">Now Active with WebSockets</div>
        <h1 className="hero-title">
          Secure, Real-time messaging, <br />
          engineered for the <span>Next Gen</span>
        </h1>
        <p className="hero-subtitle">
          Experience zero-drop message deliveries, instant status receipts, and stateful social graph structures wrapped in a fluid, premium dark aesthetic.
        </p>
        <div className="cta-group">
          <a href="#demo" className="btn btn-primary">Try Interactive Demo</a>
          <a href="#features" className="btn btn-secondary">Explore Features</a>
        </div>
      </section>

      {/* Interactive Mockup Container */}
      <section id="demo" className="mockup-container">
        <div className="chat-mockup glass">
          
          {/* Chat Sidebar */}
          <div className="mock-sidebar">
            <div className="sidebar-header">
              <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>Chats</span>
              <UserPlus size={18} className="input-btn" />
            </div>
            
            <div className="sidebar-search">
              <div className="search-input-wrapper">
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input type="text" placeholder="Search direct messages..." disabled />
              </div>
            </div>

            <div className="mock-chat-list">
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  className={`mock-chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setIsTyping(false);
                  }}
                >
                  <div className="avatar-wrapper">
                    <div className="mock-avatar">{chat.avatar}</div>
                    {chat.isOnline && <div className="status-dot"></div>}
                  </div>
                  <div className="chat-item-info">
                    <div className="chat-item-header">
                      <span className="chat-item-name">{chat.name}</span>
                      <span className="chat-item-time">{chat.time}</span>
                    </div>
                    <span className="chat-item-msg">{chat.lastMessage}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Room Area */}
          <div className="mock-chat-room">
            <div className="room-header">
              <div className="room-user-info">
                <div className="avatar-wrapper">
                  <div className="mock-avatar">{activeChat.avatar}</div>
                  {activeChat.isOnline && <div className="status-dot"></div>}
                </div>
                <div>
                  <div className="room-username">{activeChat.name}</div>
                  <div className={`room-status ${activeChat.isOnline ? 'online' : ''}`}>
                    {activeChat.isOnline ? 'online' : 'offline'}
                  </div>
                </div>
              </div>
              <div className="room-actions">
                <Phone size={18} />
                <Video size={18} />
                <MoreVertical size={18} />
              </div>
            </div>

            {/* Message Area */}
            <div className="messages-container">
              {activeChat.messages.map(msg => (
                <div key={msg.id} className={`msg-wrapper ${msg.sender === 'me' ? 'sent' : 'received'}`}>
                  <div className="msg-bubble">
                    {msg.content}
                  </div>
                  <div className="msg-meta">
                    <span>{msg.time}</span>
                    {msg.sender === 'me' && renderStatusTicks(msg.status)}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="msg-wrapper received">
                  <div className="typing-indicator">
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                    <div className="typing-dot"></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendMessage} className="input-area">
              <Smile size={20} className="input-btn" />
              <Paperclip size={20} className="input-btn" />
              <input 
                type="text" 
                className="mock-input-box" 
                placeholder="Type a secure message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
              />
              <button type="submit" className="send-btn">
                <Send size={18} />
              </button>
            </form>

          </div>

        </div>
      </section>

      {/* System Architecture & Engineering Highlights */}
      <section id="features" className="features-section">
        <div className="features-header">
          <div className="badge">🛠️ System Architecture & Engineering Highlights</div>
          <h2 className="features-title">Enterprise System Architecture</h2>
          <p className="features-subtitle">Under the hood of a high-performance system design engineered to wow recruiters.</p>
        </div>
        <div className="features-grid">
          
          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper">
              <Cpu size={24} />
            </div>
            <div className="tech-badge">Express.js + Socket.IO + Redis</div>
            <h3>⚡ Dual-Protocol Real-Time Engine</h3>
            <p className="eyecatcher-title">The Recruiters' Eyecatcher:</p>
            <p>Engineered a hybrid network architecture that synthesizes stateless HTTP REST APIs with stateful WebSockets. Messages are committed durably to PostgreSQL before real-time broadcasting, ensuring a zero-data-loss pipeline backed by Redis connection tracking.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper">
              <Database size={24} />
            </div>
            <div className="tech-badge">PostgreSQL + Advanced SQL</div>
            <h3>📉 Scalable Data Engineering & O(1) Pagination</h3>
            <p className="eyecatcher-title">The Recruiters' Eyecatcher:</p>
            <p>Eliminated database read-degradation by enforcing system-wide Cursor-Based Pagination for infinite scrolling feeds and chat histories. Offloaded complex data-merging and cross-user metadata resolution entirely to the database layer using dynamic query compilation.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper">
              <Server size={24} />
            </div>
            <div className="tech-badge">PostgreSQL + Redis Cache</div>
            <h3>💾 Polyglot Persistence & Distributed State</h3>
            <p className="eyecatcher-title">The Recruiters' Eyecatcher:</p>
            <p>Orchestrated a dual-datastore blueprint. PostgreSQL handles multi-tenant group mappings and structured data via atomic transactions and automated database-level triggers, while Redis drives microsecond-latency caching for active social feeds.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper">
              <Lock size={24} />
            </div>
            <div className="tech-badge">JWT + HttpOnly Cookies + Guards</div>
            <h3>🔒 Zero-Trust Security Fabric</h3>
            <p className="eyecatcher-title">The Recruiters' Eyecatcher:</p>
            <p>Implemented an end-to-end server-side authentication pipeline. Session tokens are delivered exclusively via encrypted HttpOnly browser cookies, tightly guarding both stateless HTTP endpoints and stateful WebSocket connection handshakes against XSS/CSRF vectors.</p>
          </div>

        </div>
      </section>

      <div className="section-divider"></div>

      {/* Core Functional Capabilities */}
      <section className="features-section" style={{ marginTop: '0px' }}>
        <div className="features-header">
          <div className="badge" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#3b82f6' }}>📊 Core Functional Capabilities</div>
          <h2 className="features-title">Feature Matrix & Capabilities</h2>
          <p className="features-subtitle">Comprehensive set of real-world backend features and state machines.</p>
        </div>
        <div className="features-grid">

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper" style={{ color: '#3b82f6', background: 'rgba(59, 130, 246, 0.15)' }}>
              <Share2 size={24} />
            </div>
            <h3>🔗 The Social Graph</h3>
            <p>Asymmetrical follower/following engine that dynamically calculates network matrices to restrict or grant user interactions.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.15)' }}>
              <Rss size={24} />
            </div>
            <h3>📰 Activity Feed Fan-Out</h3>
            <p>Reverse-chronological feed aggregation that instantly merges timeline content from a user's entire social graph.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)' }}>
              <CheckCheck size={24} />
            </div>
            <h3>📨 Granular Message Receipts</h3>
            <p>Real-time state mutations that track message lifecycles through three distinct phases: Sent, Delivered, and Read.</p>
          </div>

          <div className="glass-card feature-card">
            <div className="feature-icon-wrapper" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.15)' }}>
              <UserX size={24} />
            </div>
            <h3>🚫 Dynamic Access Revocation</h3>
            <p>Stateful group-chat architecture that instantly cuts off WebSocket broadcast streams and history fetching the millisecond a participant leaves or is removed.</p>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div>© 2026 ConnectSphere. Built with React & TypeScript.</div>
        <div className="footer-links">
          <a href="#" className="footer-link">Privacy Policy</a>
          <a href="#" className="footer-link">Terms of Service</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="footer-link">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
