import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare, Plus, Users, X, Send, Check, CheckCheck,
  ChevronLeft, Search, UserPlus, Trash2, LogOut, Image as ImageIcon
} from 'lucide-react';
import { api, apiRequest, getAccessToken } from '../services/api';
import ImageUploader from '../components/ImageUploader';
import './Chat.css';

/* ────────────────────────────────── Types ────────────────────────────────── */

interface InboxItem {
  conversation_id: string;
  type: 'DM' | 'GROUP';
  conversation_name: string | null;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_at: string | null;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface ProfileMini {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_pic_url: string | null;
}

interface ChatProps {
  currentUserId: string;
}

/* ────────────────────────────────── Helpers ─────────────────────────────── */

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  return (name || '?').substring(0, 2).toUpperCase();
}

/* ────────────────────────────────── Component ───────────────────────────── */

export default function Chat({ currentUserId }: ChatProps) {
  /* Socket */
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  /* Inbox */
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxCursor, setInboxCursor] = useState<string | null>(null);

  /* Active conversation */
  const [activeConv, setActiveConv] = useState<InboxItem | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [msgCursor, setMsgCursor] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgImageUrl, setMsgImageUrl] = useState('');
  const [showImageInput, setShowImageInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep a mutable ref of activeConv in sync so the WebSocket listener closure has access to the latest state
  const activeConvRef = useRef<InboxItem | null>(null);
  useEffect(() => {
    activeConvRef.current = activeConv;
  }, [activeConv]);

  /* Profile cache */
  const [profileCache, setProfileCache] = useState<Record<string, ProfileMini>>({});
  const profileFetchQueue = useRef<Set<string>>(new Set());

  /* Typing */
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const myTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Message read tracking */
  const unreadMessageIds = useRef<Set<string>>(new Set());

  /* New DM modal */
  const [showNewDM, setShowNewDM] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmResults, setDmResults] = useState<ProfileMini[]>([]);
  const [dmSearching, setDmSearching] = useState(false);

  /* New Group modal */
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupFollowers, setGroupFollowers] = useState<ProfileMini[]>([]);
  const [groupSelected, setGroupSelected] = useState<ProfileMini[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  /* Group management modal */
  const [showGroupMgmt, setShowGroupMgmt] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<ProfileMini[]>([]);

  /* ── Socket setup ── */

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !currentUserId) return;

    // Connect directly to port 3000 in local dev to bypass Vite's ws proxy write ECONNABORTED error
    const wsUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:3000'
      : window.location.origin;

    const socket = io(wsUrl, {
      path: '/api/v1/chat/connect/',
      query: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      console.log('🟢 Socket connected');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      console.log('🔴 Socket disconnected');
    });

    /* Real-time new message */
    socket.on('RECEIVE_MESSAGE', (msg: Message) => {
      const isActive = activeConvRef.current?.conversation_id === msg.conversation_id;

      setMessages(prev => {
        // Avoid duplicates
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Update inbox last message
      setInbox(prev => prev.map(item => {
        if (item.conversation_id === msg.conversation_id) {
          return {
            ...item,
            last_message_content: msg.content || '📷 Image',
            last_message_at: msg.created_at,
            last_message_id: msg.id
          };
        }
        return item;
      }));

      // Sort inbox so most recent is first
      setInbox(prev => [...prev].sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTime - aTime;
      }));

      // Emit delivery receipt immediately
      socket.emit('MESSAGE_DELIVERED', { messageId: msg.id });

      // If active conversation, also mark as read immediately
      if (isActive) {
        socket.emit('MESSAGE_READ', { messageId: msg.id });
      }

      // Enrich sender profile
      fetchProfileMini(msg.sender_id);
    });

    /* Delivery receipt */
    socket.on('RECEIPT_DELIVERED', ({ messageId, deliveredAt }: { messageId: string; deliveredAt: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, delivered_at: deliveredAt } : m
      ));
    });

    /* Read receipt */
    socket.on('RECEIPT_READ', ({ messageId, readAt }: { messageId: string; readAt: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, read_at: readAt } : m
      ));
    });

    /* Typing indicator */
    socket.on('USER_TYPING', ({ conversationId, userId }: { conversationId: string; userId: string }) => {
      setActiveConv(curr => {
        if (curr?.conversation_id !== conversationId) return curr;
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
        if (typingTimerRef.current[userId]) clearTimeout(typingTimerRef.current[userId]);
        typingTimerRef.current[userId] = setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(userId);
            return next;
          });
        }, 3000);
        return curr;
      });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUserId]);

  /* ── Fetch profile mini ── */

  const fetchProfileMini = useCallback(async (userId: string) => {
    if (!userId || profileCache[userId] || profileFetchQueue.current.has(userId)) return;
    profileFetchQueue.current.add(userId);
    try {
      const res = await api.get(`/api/v1/profiles/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setProfileCache(prev => ({
          ...prev,
          [userId]: {
            user_id: data.user_id,
            username: data.username,
            display_name: data.display_name,
            profile_pic_url: data.profile_pic_url
          }
        }));
      }
    } catch (_) {}
    finally { profileFetchQueue.current.delete(userId); }
  }, [profileCache]);

  /* ── Sync delivery receipts for inbox on come online ── */

  const syncDeliveryReceipts = useCallback(async (inboxList: InboxItem[]) => {
    for (const item of inboxList) {
      try {
        const res = await api.get(`/api/v1/chats/${item.conversation_id}/messages?limit=10`);
        if (res.ok) {
          const data = await res.json();
          const msgs: Message[] = Array.isArray(data) ? data : (data?.data ?? []);
          for (const msg of msgs) {
            if (msg.sender_id !== currentUserId && !msg.delivered_at) {
              socketRef.current?.emit('MESSAGE_DELIVERED', { messageId: msg.id });
            }
          }
        }
      } catch (_) {}
    }
  }, [currentUserId]);

  /* ── Fetch inbox ── */

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await api.get('/api/v1/chats?limit=30');
      if (res.ok) {
        const data = await res.json();
        const list: InboxItem[] = Array.isArray(data) ? data : (data?.data ?? []);
        setInbox(list);
        setInboxCursor(data?.nextCursor ?? null);
        // Trigger delivery receipt sync for all loaded conversations
        syncDeliveryReceipts(list);
      }
    } catch (_) {}
    finally { setInboxLoading(false); }
  }, [syncDeliveryReceipts]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  /* ── Open conversation ── */

  const openConversation = async (item: InboxItem) => {
    setActiveConv(item);
    setMessages([]);
    setMsgCursor(null);
    setMsgText('');
    setMsgImageUrl('');
    setShowImageInput(false);
    setMsgLoading(true);
    setTypingUsers(new Set());
    unreadMessageIds.current.clear();

    try {
      const res = await api.get(`/api/v1/chats/${item.conversation_id}/messages?limit=40`);
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = Array.isArray(data) ? data : (data?.data ?? []);
        // Messages come DESC from API, reverse to show oldest first
        const sorted = [...msgs].reverse();
        setMessages(sorted);
        setMsgCursor(data?.nextCursor ?? null);

        // Track unread messages and emit read receipts for messages we receive
        for (const msg of sorted) {
          if (msg.sender_id !== currentUserId && !msg.read_at) {
            unreadMessageIds.current.add(msg.id);
            socketRef.current?.emit('MESSAGE_READ', { messageId: msg.id });
          }
          fetchProfileMini(msg.sender_id);
        }
      }
    } catch (_) {}
    finally { setMsgLoading(false); }

    // Load participants (works for both DM and GROUP)
    loadGroupParticipants(item.conversation_id);
  };

  /* ── Load older messages ── */

  const loadOlderMessages = async () => {
    if (!activeConv || !msgCursor || msgLoading) return;
    setMsgLoading(true);
    try {
      const res = await api.get(
        `/api/v1/chats/${activeConv.conversation_id}/messages?limit=40&cursor=${encodeURIComponent(msgCursor)}`
      );
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = Array.isArray(data) ? data : (data?.data ?? []);
        const sorted = [...msgs].reverse();
        setMessages(prev => [...sorted, ...prev]);
        setMsgCursor(data?.nextCursor ?? null);
        for (const msg of sorted) fetchProfileMini(msg.sender_id);
      }
    } catch (_) {}
    finally { setMsgLoading(false); }
  };

  /* Auto-scroll to bottom when new message arrives */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ── Send message ── */

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || (!msgText.trim() && !msgImageUrl.trim()) || sending) return;

    setSending(true);
    const content = msgText.trim() || undefined;
    const image_url = msgImageUrl.trim() || undefined;
    setMsgText('');
    setMsgImageUrl('');
    setShowImageInput(false);

    try {
      const res = await api.post(`/api/v1/chats/${activeConv.conversation_id}/messages`, {
        content,
        image_url
      });
      if (res.ok) {
        const data = await res.json();
        const newMsg: Message = data.data ?? data;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // Update inbox
        setInbox(prev => {
          const updated = prev.map(item => {
            if (item.conversation_id === activeConv.conversation_id) {
              return { ...item, last_message_content: content || '📷 Image', last_message_at: newMsg.created_at };
            }
            return item;
          });
          return [...updated].sort((a, b) => {
            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return bTime - aTime;
          });
        });
      }
    } catch (_) {}
    finally { setSending(false); }
  };

  /* ── Typing indicator emit ── */

  const handleTyping = (value: string) => {
    setMsgText(value);
    if (!activeConv || !socketRef.current) return;

    // Emit TYPING_START to all other participants (works for both DMs and Groups)
    // We throttle this to once per 2s
    if (myTypingTimer.current) return;
    
    const otherParticipants = groupParticipants.filter(id => id !== currentUserId);
    if (otherParticipants.length > 0) {
      for (const recipientId of otherParticipants) {
        socketRef.current.emit('TYPING_START', {
          conversationId: activeConv.conversation_id,
          recipientId: recipientId
        });
      }
    } else {
      // Fallback if participants list not fully loaded yet
      socketRef.current.emit('TYPING_START', {
        conversationId: activeConv.conversation_id,
        recipientId: ''
      });
    }

    myTypingTimer.current = setTimeout(() => {
      myTypingTimer.current = null;
    }, 2000);
  };

  /* ── Search users for DM ── */

  useEffect(() => {
    if (!dmSearch.trim()) { setDmResults([]); return; }
    const t = setTimeout(async () => {
      setDmSearching(true);
      try {
        const res = await api.get(`/api/v1/profiles/search?q=${encodeURIComponent(dmSearch)}&limit=8`);
        if (res.ok) {
          const data = await res.json();
          const list: ProfileMini[] = data?.data ?? [];
          setDmResults(list.filter(u => u.user_id !== currentUserId));
        }
      } catch (_) {}
      finally { setDmSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [dmSearch, currentUserId]);

  const startDM = async (recipientId: string) => {
    try {
      const res = await api.post('/api/v1/chats/dm', { recipient_id: recipientId });
      if (res.ok) {
        const data = await res.json();
        const convId = data?.data?.conversationId ?? data?.conversationId;
        // Refresh inbox then open the conversation
        await fetchInbox();
        setShowNewDM(false);
        setDmSearch('');
        // Find or synthesize conversation
        setInbox(prev => {
          const found = prev.find(i => i.conversation_id === convId);
          const target = found ?? {
            conversation_id: convId,
            type: 'DM' as const,
            conversation_name: profileCache[recipientId]?.display_name ?? profileCache[recipientId]?.username ?? 'New Chat',
            last_message_id: null,
            last_message_content: null,
            last_message_at: null
          };
          if (!found) return [target, ...prev];
          return prev;
        });
        // Re-fetch to get the actual item then open
        const refreshed = await api.get('/api/v1/chats?limit=30');
        if (refreshed.ok) {
          const refreshData = await refreshed.json();
          const refreshList: InboxItem[] = Array.isArray(refreshData) ? refreshData : (refreshData?.data ?? []);
          setInbox(refreshList);
          const conv = refreshList.find(i => i.conversation_id === convId);
          if (conv) openConversation(conv);
        }
      }
    } catch (_) {}
  };

  /* ── Group creation ── */

  const fetchFollowersForGroup = useCallback(async () => {
    try {
      const res = await api.get(`/api/v1/follows/${currentUserId}/followers?limit=50`);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data?.data ?? []);
        const ids: string[] = rawList.map((r: any) => r.follower_id ?? r.following_id).filter(Boolean);
        // Fetch profiles for all ids
        const profiles: ProfileMini[] = (await Promise.all(ids.map(async (id) => {
          if (profileCache[id]) return profileCache[id];
          const r = await api.get(`/api/v1/profiles/${id}`);
          if (r.ok) {
            const p = await r.json();
            return { user_id: p.user_id, username: p.username, display_name: p.display_name, profile_pic_url: p.profile_pic_url } as ProfileMini;
          }
          return null;
        }))).filter((p): p is ProfileMini => p !== null);
        setGroupFollowers(profiles.filter(Boolean) as ProfileMini[]);
        // Cache them
        const cacheUpdate: Record<string, ProfileMini> = {};
        (profiles.filter(Boolean) as ProfileMini[]).forEach(p => { cacheUpdate[p.user_id] = p; });
        setProfileCache(prev => ({ ...prev, ...cacheUpdate }));
      }
    } catch (_) {}
  }, [currentUserId, profileCache]);

  useEffect(() => {
    if (showNewGroup) {
      fetchFollowersForGroup();
      setGroupName('');
      setGroupSearch('');
      setGroupSelected([]);
      setGroupError(null);
    }
  }, [showNewGroup]);

  const filteredGroupFollowers = groupFollowers.filter(u => {
    if (!u) return false;
    const q = groupSearch.toLowerCase();
    const username = (u.username || '').toLowerCase();
    const displayName = (u.display_name || '').toLowerCase();
    return !groupSelected.some(s => s?.user_id === u.user_id) &&
      (username.includes(q) || displayName.includes(q));
  });

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupSelected.length === 0) {
      setGroupError('Group name and at least one member are required.');
      return;
    }
    setCreatingGroup(true);
    setGroupError(null);
    try {
      const res = await api.post('/api/v1/chats/group', {
        name: groupName.trim(),
        participant_ids: groupSelected.map(u => u.user_id)
      });
      if (res.ok) {
        await fetchInbox();
        setShowNewGroup(false);
      } else {
        const err = await res.json().catch(() => ({}));
        setGroupError(err.error || 'Could not create group');
      }
    } catch (_) {
      setGroupError('Network error');
    } finally {
      setCreatingGroup(false);
    }
  };

  /* ── Group management ── */

  const loadGroupParticipants = async (convId: string) => {
    try {
      const res = await api.get(`/api/v1/chats/${convId}/participants`);
      if (res.ok) {
        const data = await res.json();
        const ids: string[] = Array.isArray(data?.data) ? data.data : [];
        setGroupParticipants(ids);
        ids.forEach(fetchProfileMini);
      }
    } catch (_) {}
  };

  const handleAddMember = async (userId: string) => {
    if (!activeConv) return;
    try {
      const res = await api.post(`/api/v1/chats/${activeConv.conversation_id}/members`, {
        user_id_to_add: userId
      });
      if (res.ok) {
        setGroupParticipants(prev => prev.includes(userId) ? prev : [...prev, userId]);
        setAddMemberSearch('');
        setAddMemberResults([]);
        fetchProfileMini(userId);
      }
    } catch (_) {}
  };

  const handleRemoveMember = async (userId: string) => {
    if (!activeConv) return;
    try {
      const res = await apiRequest(`/api/v1/chats/${activeConv.conversation_id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id_to_remove: userId })
      });
      if (res.ok) {
        setGroupParticipants(prev => prev.filter(id => id !== userId));
      }
    } catch (_) {}
  };

  const handleLeaveGroup = async () => {
    if (!activeConv) return;
    try {
      const res = await api.post(`/api/v1/chats/${activeConv.conversation_id}/leave`);
      if (res.ok) {
        setActiveConv(null);
        setInbox(prev => prev.filter(i => i.conversation_id !== activeConv.conversation_id));
        setShowGroupMgmt(false);
      }
    } catch (_) {}
  };

  /* ── Add-member search (from followers list) ── */

  useEffect(() => {
    if (!addMemberSearch.trim()) { setAddMemberResults([]); return; }
    const q = addMemberSearch.toLowerCase();
    const filtered = groupFollowers.filter(u => {
      if (!u) return false;
      const username = (u.username || '').toLowerCase();
      const displayName = (u.display_name || '').toLowerCase();
      return !groupParticipants.includes(u.user_id) &&
        (username.includes(q) || displayName.includes(q));
    });
    setAddMemberResults(filtered);
  }, [addMemberSearch, groupFollowers, groupParticipants]);

  /* ── Message status icon ── */

  const MessageStatus = ({ msg }: { msg: Message }) => {
    if (msg.sender_id !== currentUserId) return null;
    if (msg.read_at) return <CheckCheck size={12} className="receipt-icon receipt-read" />;
    if (msg.delivered_at) return <CheckCheck size={12} className="receipt-icon receipt-delivered" />;
    return <Check size={12} className="receipt-icon receipt-sent" />;
  };

  /* ─────────────────────────────── RENDER ────────────────────────────────── */

  return (
    <div className="chat-workspace">
      {/* ── LEFT PANEL: Inbox ── */}
      <aside className="chat-sidebar glass">
        <div className="chat-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <MessageSquare size={20} className="icon-accent" />
            <h2 className="chat-sidebar-title">Messages</h2>
            {socketConnected && <div className="ws-indicator" title="Connected" />}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="chat-icon-btn" title="New DM" onClick={() => setShowNewDM(true)}>
              <Plus size={18} />
            </button>
            <button className="chat-icon-btn" title="New Group" onClick={() => setShowNewGroup(true)}>
              <Users size={18} />
            </button>
          </div>
        </div>

        <div className="chat-inbox-list">
          {inboxLoading && inbox.length === 0 ? (
            <div className="chat-loading-state">
              <div className="typing-indicator"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>
            </div>
          ) : inbox.length === 0 ? (
            <div className="chat-empty-state">
              <MessageSquare size={36} className="icon-muted" />
              <p>No conversations yet.</p>
              <p className="chat-empty-hint">Start a DM or create a group!</p>
            </div>
          ) : (
            inbox.map(item => (
              <div
                key={item.conversation_id}
                className={`inbox-item ${activeConv?.conversation_id === item.conversation_id ? 'inbox-item-active' : ''}`}
                onClick={() => openConversation(item)}
              >
                <div className="inbox-avatar">
                  {item.type === 'GROUP'
                    ? <Users size={18} className="icon-accent" />
                    : initials(item.conversation_name ?? 'DM')}
                </div>
                <div className="inbox-info">
                  <div className="inbox-name">{item.conversation_name ?? (item.type === 'GROUP' ? 'Group' : 'DM')}</div>
                  <div className="inbox-preview">
                    {item.last_message_content || (item.last_message_id ? '📷 Image' : 'No messages yet')}
                  </div>
                </div>
                <div className="inbox-meta">
                  <div className="inbox-time">{formatTime(item.last_message_at)}</div>
                  {item.type === 'GROUP' && <div className="inbox-badge-group">G</div>}
                </div>
              </div>
            ))
          )}
          {inboxCursor && (
            <button className="load-more-btn" onClick={async () => {
              const res = await api.get(`/api/v1/chats?limit=20&cursor=${encodeURIComponent(inboxCursor)}`);
              if (res.ok) {
                const data = await res.json();
                const more: InboxItem[] = Array.isArray(data) ? data : (data?.data ?? []);
                setInbox(prev => [...prev, ...more]);
                setInboxCursor(data?.nextCursor ?? null);
              }
            }}>Load more</button>
          )}
        </div>
      </aside>

      {/* ── RIGHT PANEL: Conversation ── */}
      <main className="chat-main">
        {!activeConv ? (
          <div className="chat-placeholder">
            <div className="chat-placeholder-icon">
              <MessageSquare size={56} />
            </div>
            <h3>Select a conversation</h3>
            <p>Choose a DM or group from the left to start chatting</p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button className="btn-chat-action" onClick={() => setShowNewDM(true)}>
                <Plus size={16} /> New Message
              </button>
              <button className="btn-chat-action secondary" onClick={() => setShowNewGroup(true)}>
                <Users size={16} /> New Group
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="chat-conv-header glass">
              <button className="chat-icon-btn" onClick={() => setActiveConv(null)} style={{ marginRight: '4px' }}>
                <ChevronLeft size={20} />
              </button>
              <div className="chat-conv-avatar">
                {activeConv.type === 'GROUP'
                  ? <Users size={18} className="icon-accent" />
                  : initials(activeConv.conversation_name ?? 'DM')}
              </div>
              <div className="chat-conv-info">
                <div className="chat-conv-name">{activeConv.conversation_name ?? (activeConv.type === 'GROUP' ? 'Group' : 'DM')}</div>
                <div className="chat-conv-sub">
                  {activeConv.type === 'GROUP'
                    ? `${groupParticipants.length + 1} members`
                    : socketConnected ? 'Connected' : 'Connecting…'}
                </div>
              </div>
              {activeConv.type === 'GROUP' && (
                <button className="chat-icon-btn" title="Group settings" onClick={() => {
                  setShowGroupMgmt(true);
                  loadGroupParticipants(activeConv.conversation_id);
                  fetchFollowersForGroup();
                  setAddMemberSearch('');
                  setAddMemberResults([]);
                }}>
                  <Users size={18} />
                </button>
              )}
            </div>

            {/* Messages Area */}
            <div className="chat-messages-area">
              {msgCursor && (
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <button className="load-more-btn" onClick={loadOlderMessages} disabled={msgLoading}>
                    {msgLoading ? '…' : 'Load older messages'}
                  </button>
                </div>
              )}

              {msgLoading && messages.length === 0 ? (
                <div className="chat-loading-state">
                  <div className="typing-indicator"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="chat-empty-state">
                  <p>No messages yet — say hello! 👋</p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = msg.sender_id === currentUserId;
                  const sender = profileCache[msg.sender_id];
                  const showAvatar = !isMine && (idx === 0 || messages[idx - 1]?.sender_id !== msg.sender_id);
                  const senderName = sender?.display_name ?? sender?.username ?? `User…`;

                  return (
                    <div
                      key={msg.id}
                      className={`msg-row ${isMine ? 'msg-mine' : 'msg-theirs'}`}
                    >
                      {!isMine && (
                        <div className="msg-avatar-area">
                          {showAvatar ? (
                            <div className="msg-avatar">
                              {sender?.profile_pic_url
                                ? <img src={sender.profile_pic_url} alt="" />
                                : initials(senderName)}
                            </div>
                          ) : <div style={{ width: '32px' }} />}
                        </div>
                      )}

                      <div className={`msg-bubble-group ${isMine ? 'mine' : ''}`}>
                        {!isMine && showAvatar && (
                          <div className="msg-sender-name">{senderName}</div>
                        )}
                        <div className={`msg-bubble ${isMine ? 'msg-bubble-mine' : 'msg-bubble-theirs'}`}>
                          {msg.image_url && (
                            <img
                              src={msg.image_url}
                              alt="attachment"
                              className="msg-image"
                              onClick={() => window.open(msg.image_url!, '_blank')}
                            />
                          )}
                          {msg.content && <p className="msg-text">{msg.content}</p>}
                          <div className="msg-meta">
                            <span className="msg-time">{formatTime(msg.created_at)}</span>
                            <MessageStatus msg={msg} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Typing indicator */}
              {typingUsers.size > 0 && (
                <div className="msg-row msg-theirs">
                  <div className="msg-avatar-area"><div style={{ width: '32px' }} /></div>
                  <div className="msg-bubble-group">
                    <div className="msg-bubble msg-bubble-theirs">
                      <div className="typing-indicator">
                        <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form className="chat-input-area" onSubmit={handleSend}>
              {showImageInput && (
                <div className="chat-image-input-row" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <ImageUploader
                      value={msgImageUrl}
                      onChange={setMsgImageUrl}
                      placeholder="/uploads/photo.jpg or https://…"
                    />
                  </div>
                  <button type="button" className="chat-icon-btn" style={{ marginTop: '6px' }} onClick={() => { setShowImageInput(false); setMsgImageUrl(''); }}>
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="chat-input-row">
                <button
                  type="button"
                  className={`chat-icon-btn ${showImageInput ? 'active' : ''}`}
                  title="Attach image URL"
                  onClick={() => setShowImageInput(v => !v)}
                >
                  <ImageIcon size={18} />
                </button>
                <div className="chat-text-input-wrapper">
                  <input
                    type="text"
                    className="chat-text-input"
                    placeholder="Type a message…"
                    value={msgText}
                    onChange={e => handleTyping(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(e as any); }}
                    autoComplete="off"
                  />
                </div>
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={(!msgText.trim() && !msgImageUrl.trim()) || sending}
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </>
        )}
      </main>

      {/* ═════════════════ NEW DM MODAL ════════════════ */}
      {showNewDM && (
        <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowNewDM(false); }}>
          <div className="chat-modal glass">
            <div className="chat-modal-header">
              <h3>New Message</h3>
              <button className="chat-icon-btn" onClick={() => setShowNewDM(false)}><X size={18} /></button>
            </div>
            <div className="chat-modal-body">
              <div className="search-input-wrapper" style={{ marginBottom: '16px' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search users…"
                  value={dmSearch}
                  onChange={e => setDmSearch(e.target.value)}
                  autoFocus
                />
                {dmSearching && <div className="typing-indicator" style={{ transform: 'scale(0.6)' }}><div className="typing-dot" /><div className="typing-dot" /></div>}
              </div>
              <div className="chat-user-list">
                {dmResults.map(u => (
                  <div key={u.user_id} className="chat-user-item" onClick={() => startDM(u.user_id)}>
                    <div className="msg-avatar" style={{ flexShrink: 0 }}>
                      {u.profile_pic_url
                        ? <img src={u.profile_pic_url} alt="" />
                        : initials(u.display_name ?? u.username)}
                    </div>
                    <div>
                      <div className="chat-user-name">{u.display_name ?? u.username}</div>
                      <div className="chat-user-sub">@{u.username}</div>
                    </div>
                    <Plus size={16} className="icon-accent" style={{ marginLeft: 'auto' }} />
                  </div>
                ))}
                {dmSearch.trim() && dmResults.length === 0 && !dmSearching && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No users found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════ NEW GROUP MODAL ════════════════ */}
      {showNewGroup && (
        <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowNewGroup(false); }}>
          <div className="chat-modal glass" style={{ maxWidth: '480px' }}>
            <div className="chat-modal-header">
              <h3>New Group</h3>
              <button className="chat-icon-btn" onClick={() => setShowNewGroup(false)}><X size={18} /></button>
            </div>
            <div className="chat-modal-body">
              {groupError && <div className="error-banner" style={{ marginBottom: '12px' }}>{groupError}</div>}
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Group Name</label>
                <div className="input-field-wrapper">
                  <input
                    type="text"
                    placeholder="e.g. Weekend Squad"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                  />
                </div>
              </div>

              {groupSelected.length > 0 && (
                <div className="selected-members-row">
                  {groupSelected.map(u => (
                    <div key={u.user_id} className="selected-chip">
                      <span>@{u.username}</span>
                      <button onClick={() => setGroupSelected(prev => prev.filter(x => x.user_id !== u.user_id))}>
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="search-input-wrapper" style={{ marginBottom: '12px' }}>
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search your followers…"
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                />
              </div>

              <div className="chat-user-list" style={{ maxHeight: '200px' }}>
                {filteredGroupFollowers.map(u => (
                  <div
                    key={u.user_id}
                    className="chat-user-item"
                    onClick={() => setGroupSelected(prev => prev.some(x => x.user_id === u.user_id) ? prev : [...prev, u])}
                  >
                    <div className="msg-avatar" style={{ flexShrink: 0 }}>
                      {u.profile_pic_url ? <img src={u.profile_pic_url} alt="" /> : initials(u.display_name ?? u.username)}
                    </div>
                    <div>
                      <div className="chat-user-name">{u.display_name ?? u.username}</div>
                      <div className="chat-user-sub">@{u.username}</div>
                    </div>
                    <Plus size={14} className="icon-accent" style={{ marginLeft: 'auto' }} />
                  </div>
                ))}
                {filteredGroupFollowers.length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '16px', fontSize: '0.85rem' }}>
                    {groupFollowers.length === 0 ? 'No followers to add.' : 'No matches found.'}
                  </p>
                )}
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '16px' }}
                onClick={handleCreateGroup}
                disabled={creatingGroup || !groupName.trim() || groupSelected.length === 0}
              >
                {creatingGroup ? 'Creating…' : `Create Group (${groupSelected.length + 1} members)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════ GROUP MANAGEMENT MODAL ════════════════ */}
      {showGroupMgmt && activeConv?.type === 'GROUP' && (
        <div className="chat-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowGroupMgmt(false); }}>
          <div className="chat-modal glass" style={{ maxWidth: '440px' }}>
            <div className="chat-modal-header">
              <h3>Group Settings</h3>
              <button className="chat-icon-btn" onClick={() => setShowGroupMgmt(false)}><X size={18} /></button>
            </div>
            <div className="chat-modal-body">

              {/* Current members */}
              <div className="group-mgmt-section">
                <div className="group-mgmt-label">Members ({groupParticipants.length})</div>
                <div className="chat-user-list" style={{ maxHeight: '160px' }}>
                  {groupParticipants.map(pid => {
                    const p = profileCache[pid];
                    const pName = p?.display_name ?? p?.username ?? pid.substring(0, 8);
                    return (
                      <div key={pid} className="chat-user-item">
                        <div className="msg-avatar" style={{ flexShrink: 0 }}>
                          {p?.profile_pic_url ? <img src={p.profile_pic_url} alt="" /> : initials(pName)}
                        </div>
                        <div>
                          <div className="chat-user-name">{pName}</div>
                          {p?.username && <div className="chat-user-sub">@{p.username}</div>}
                        </div>
                        {pid !== currentUserId && (
                          <button
                            className="chat-icon-btn danger"
                            title="Remove member"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => handleRemoveMember(pid)}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add member */}
              <div className="group-mgmt-section">
                <div className="group-mgmt-label">Add Member</div>
                <div className="search-input-wrapper" style={{ marginBottom: '8px' }}>
                  <Search size={14} />
                  <input
                    type="text"
                    placeholder="Search your followers…"
                    value={addMemberSearch}
                    onChange={e => setAddMemberSearch(e.target.value)}
                  />
                </div>
                <div className="chat-user-list" style={{ maxHeight: '120px' }}>
                  {addMemberResults.map(u => (
                    <div key={u.user_id} className="chat-user-item" onClick={() => handleAddMember(u.user_id)}>
                      <div className="msg-avatar" style={{ flexShrink: 0 }}>
                        {u.profile_pic_url ? <img src={u.profile_pic_url} alt="" /> : initials(u.display_name ?? u.username)}
                      </div>
                      <div>
                        <div className="chat-user-name">{u.display_name ?? u.username}</div>
                        <div className="chat-user-sub">@{u.username}</div>
                      </div>
                      <UserPlus size={14} className="icon-accent" style={{ marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Leave group */}
              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '12px', borderColor: '#ef4444', color: '#ef4444' }}
                onClick={handleLeaveGroup}
              >
                <LogOut size={16} />
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
