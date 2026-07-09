import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Edit3,
  Check,
  X,
  Star,
  Grid,
  Heart,
  LogOut,
  ChevronLeft,
  UserCheck,
  UserPlus,
  Users,
  ChevronDown,
  Plus,
  Send,
  MessageSquare,
  Home as HomeIcon,
  ChevronRight,
  User as UserIcon,
  Image as ImageIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, apiRequest } from '../services/api';
import Chat from './Chat';
import './Profile.css';

/* ── Types ── */

interface ProfileData {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  profile_pic_url: string | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_celebrity: boolean;
}

interface PostData {
  id: string;
  user_id: string;
  caption: string;
  media_urls?: string[]; // node-postgres array type
  media_url?: string | null; // fallback
  like_count: number;
  comment_count?: number;
  created_at: string;
}

interface CommentData {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

interface FollowUser {
  follower_id?: string;
  following_id?: string;
  created_at: string;
}

interface SearchResult {
  user_id: string;
  username: string;
  display_name: string | null;
  profile_pic_url: string | null;
}

/* ── Component ── */

export default function Profile() {
  const { user, logout } = useAuth();
  
  // Safe helper to resolve current user's ID
  const currentUserId = user?.id || (user as any)?.user_id;

  // View tabs state: 'feed', 'profile', or 'chat'
  const [activeTab, setActiveTab] = useState<'feed' | 'profile' | 'chat'>('feed');

  // Profile states
  const [profile, setProfile]         = useState<ProfileData | null>(null);
  const [posts, setPosts]             = useState<PostData[]>([]);
  const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  // Home Feed states
  const [feedPosts, setFeedPosts]     = useState<PostData[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError]     = useState<string | null>(null);

  // Viewed user state (null = "me")
  const [viewedUserId, setViewedUserId] = useState<string | null>(null);
  const isOwnProfile = !viewedUserId || viewedUserId === currentUserId;

  // Local pending follows to override backend 5s celebrity write-buffer delay
  const [localFollows, setLocalFollows] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`pending_follows_${currentUserId || ''}`);
      return stored ? JSON.parse(stored) : {};
    } catch (_) {
      return {};
    }
  });

  // Local liked posts tracking so likes persist instantly on frontend
  const [localLikes, setLocalLikes] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`liked_posts_${currentUserId || ''}`);
      return stored ? JSON.parse(stored) : {};
    } catch (_) {
      return {};
    }
  });

  // Global cache of profile metadata (maps user_id -> SearchResult)
  const [profilesCache, setProfilesCache] = useState<Record<string, SearchResult>>({});

  const saveLocalFollow = (targetId: string, status: boolean) => {
    setLocalFollows(prev => {
      const updated = { ...prev, [targetId]: status };
      try {
        localStorage.setItem(`pending_follows_${currentUserId || ''}`, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  const saveLocalLike = (postId: string, status: boolean) => {
    setLocalLikes(prev => {
      const updated = { ...prev, [postId]: status };
      try {
        localStorage.setItem(`liked_posts_${currentUserId || ''}`, JSON.stringify(updated));
      } catch (_) {}
      return updated;
    });
  };

  // Follow interaction states
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followCooldown, setFollowCooldown] = useState(false);

  // Followers / Following list modal
  const [showModal, setShowModal]     = useState<'followers' | 'following' | 'mutuals' | null>(null);
  const [modalUsers, setModalUsers]   = useState<{ id: string }[]>([]);
  const [modalCursor, setModalCursor] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  // Create Post Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCaption, setNewCaption]           = useState('');
  const [newMediaUrls, setNewMediaUrls]       = useState<string[]>([]);
  const [imageInputText, setImageInputText]   = useState('');
  const [creatingPost, setCreatingPost]       = useState(false);
  const [createPostError, setCreatePostError] = useState<string | null>(null);

  // Post Details Modal states
  const [selectedPost, setSelectedPost]       = useState<PostData | null>(null);
  const [comments, setComments]               = useState<CommentData[]>([]);
  const [commentsCursor, setCommentsCursor]   = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newCommentText, setNewCommentText]   = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Edit Profile states
  const [editMode, setEditMode]       = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio]         = useState('');
  const [editProfilePicUrl, setEditProfilePicUrl] = useState('');
  const [editError, setEditError]     = useState<string | null>(null);
  const [updating, setUpdating]       = useState(false);

  // Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching]     = useState(false);

  // Helper: safely fetch first image source from a post
  const getPostImageUrl = (post: PostData) => {
    if (post.media_urls && post.media_urls.length > 0) {
      return post.media_urls[0];
    }
    return post.media_url || null;
  };

  /* ── Enrich profile caching helper ── */

  const enrichProfilesCache = useCallback(async (ids: string[]) => {
    const missing = ids.filter(id => id && !profilesCache[id]);
    if (missing.length === 0) return;
    
    const chunks: string[][] = [];
    for (let i = 0; i < missing.length; i += 10) chunks.push(missing.slice(i, i + 10));
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (id) => {
        try {
          const res = await api.get(`/api/v1/profiles/${id}`);
          if (res.ok) {
            const p = await res.json();
            setProfilesCache(prev => ({
              ...prev,
              [id]: {
                user_id: p.user_id,
                username: p.username,
                display_name: p.display_name,
                profile_pic_url: p.profile_pic_url
              }
            }));
          }
        } catch (_) {}
      }));
    }
  }, [profilesCache]);

  /* ── Fetch Home Feed ── */

  const fetchHomeFeed = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const res = await api.get('/api/v1/feed?limit=30');
      if (res.ok) {
        const result = await res.json();
        const feedList = result?.data ?? [];
        setFeedPosts(feedList);
        
        // Enrich profiles of post authors in feed
        const authorIds = feedList.map((p: PostData) => p.user_id);
        await enrichProfilesCache(authorIds);
      } else {
        setFeedError('Failed to retrieve feed.');
      }
    } catch (err) {
      setFeedError('Network error loading feed.');
    } finally {
      setFeedLoading(false);
    }
  }, [enrichProfilesCache]);

  useEffect(() => {
    if (activeTab === 'feed' && !viewedUserId) {
      fetchHomeFeed();
    }
  }, [activeTab, viewedUserId, fetchHomeFeed]);

  /* ── Fetch profile + posts ── */

  // Stable ref to localFollows so fetchProfile can read latest value without re-creating
  const localFollowsRef = useRef(localFollows);
  useEffect(() => { localFollowsRef.current = localFollows; }, [localFollows]);

  const fetchProfile = useCallback(async (targetId: string | null) => {
    setLoading(true);
    setError(null);
    setPosts([]);
    setPostsNextCursor(null);

    const activeId = targetId || currentUserId;
    if (!activeId) {
      setLoading(false);
      return;
    }

    try {
      const profileUrl = targetId ? `/api/v1/profiles/${targetId}` : '/api/v1/profiles/me';
      const profileRes = await api.get(profileUrl);

      if (!profileRes.ok) {
        const errData = await profileRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Could not fetch profile');
      }

      const profileData: ProfileData = await profileRes.json();
      setProfile(profileData);

      if (!targetId || targetId === currentUserId) {
        localStorage.setItem(`my_following_count_${currentUserId}`, String(profileData.following_count));
      }

      // Resolve follow status immediately via stable ref (no re-render cycle)
      if (targetId && targetId !== currentUserId) {
        const currentLocalFollows = localFollowsRef.current;
        if (currentLocalFollows[targetId] !== undefined) {
          setIsFollowing(currentLocalFollows[targetId]);
        }
        await checkFollowStatus(targetId);
      } else {
        setIsFollowing(false);
      }

      // Fetch first page of posts
      const postsRes = await api.get(`/api/v1/posts/user/${profileData.user_id}?limit=12`);
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        const postsArray = Array.isArray(postsData) ? postsData : (postsData?.data ?? []);
        setPosts(postsArray);
        setPostsNextCursor(postsData?.nextCursor ?? null);
      }

    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  // NOTE: localFollows intentionally NOT in deps — we use localFollowsRef to avoid
  // re-triggering the profile fetch every time a follow toggle changes localFollows.
  }, [currentUserId]);

  useEffect(() => {
    if (activeTab === 'profile' || viewedUserId) {
      fetchProfile(viewedUserId);
    }
  }, [viewedUserId, activeTab, fetchProfile]);

  /* ── Check if current user follows target ── */

  const checkFollowStatus = async (targetUserId: string) => {
    if (!currentUserId) return;
    try {
      const res = await api.get(`/api/v1/follows/${currentUserId}/following?limit=200`);
      if (res.ok) {
        const data = await res.json();
        const followingList: FollowUser[] = Array.isArray(data) ? data : (data?.data ?? []);
        const alreadyFollowing = followingList.some(f => f.following_id === targetUserId);
        
        if (alreadyFollowing) {
          setIsFollowing(true);
          // Sync out from localOverride if it's already verified in the DB
          setLocalFollows(prev => {
            if (prev[targetUserId] === true) {
              const { [targetUserId]: _, ...rest } = prev;
              try {
                localStorage.setItem(`pending_follows_${currentUserId}`, JSON.stringify(rest));
              } catch (_) {}
              return rest;
            }
            return prev;
          });
        } else {
          // If not in DB, fallback to what's in localFollows
          if (localFollows[targetUserId] !== undefined) {
            setIsFollowing(localFollows[targetUserId]);
          } else {
            setIsFollowing(false);
          }
        }
      }
    } catch (err) {
      console.error('Could not check follow status:', err);
    }
  };

  /* ── Follow / Unfollow ── */

  const handleFollowToggle = async () => {
    if (!profile || !currentUserId || followCooldown || followLoading) return;

    const targetId = profile.user_id;
    const wasFollowing = isFollowing;
    const nextFollowing = !wasFollowing;

    // ── OPTIMISTIC UPDATE ──
    setIsFollowing(nextFollowing);
    saveLocalFollow(targetId, nextFollowing);

    setProfile(prev => prev ? {
      ...prev,
      follower_count: Math.max(0, prev.follower_count + (wasFollowing ? -1 : 1))
    } : null);

    // Adjust current user's own following count in local storage
    try {
      const stored = localStorage.getItem(`my_following_count_${currentUserId}`);
      const baseCount = stored ? parseInt(stored) : null;
      if (baseCount !== null) {
        const nextFollowingCount = Math.max(0, baseCount + (wasFollowing ? -1 : 1));
        localStorage.setItem(`my_following_count_${currentUserId}`, String(nextFollowingCount));
        localStorage.setItem(`adj_following_${currentUserId}`, JSON.stringify({
          count: nextFollowingCount,
          timestamp: Date.now()
        }));
      }
    } catch (_) {}

    setFollowCooldown(true);
    setFollowLoading(true);

    const cooldownTimer = setTimeout(() => setFollowCooldown(false), 6000);

    try {
      const method = wasFollowing ? 'DELETE' : 'POST';
      const res = await apiRequest(`/api/v1/follows/${targetId}`, { method });

      // Revert if the server returned an error (excluding 400 that handles transient duplicate states)
      if (!res.ok && res.status !== 400) {
        setIsFollowing(wasFollowing);
        saveLocalFollow(targetId, wasFollowing);
        setProfile(prev => prev ? {
          ...prev,
          follower_count: Math.max(0, prev.follower_count + (wasFollowing ? 1 : -1))
        } : null);
        
        // Revert following count
        try {
          const stored = localStorage.getItem(`my_following_count_${currentUserId}`);
          const baseCount = stored ? parseInt(stored) : null;
          if (baseCount !== null) {
            const nextFollowingCount = Math.max(0, baseCount + (wasFollowing ? 1 : -1));
            localStorage.setItem(`my_following_count_${currentUserId}`, String(nextFollowingCount));
            localStorage.setItem(`adj_following_${currentUserId}`, JSON.stringify({
              count: nextFollowingCount,
              timestamp: Date.now()
            }));
          }
        } catch (_) {}

        console.error('Follow request failed with status:', res.status);
      }
    } catch (err) {
      // Revert on network exception
      setIsFollowing(wasFollowing);
      saveLocalFollow(targetId, wasFollowing);
      setProfile(prev => prev ? {
        ...prev,
        follower_count: Math.max(0, prev.follower_count + (wasFollowing ? 1 : -1))
      } : null);

      // Revert following count
      try {
        const stored = localStorage.getItem(`my_following_count_${currentUserId}`);
        const baseCount = stored ? parseInt(stored) : null;
        if (baseCount !== null) {
          const nextFollowingCount = Math.max(0, baseCount + (wasFollowing ? 1 : -1));
          localStorage.setItem(`my_following_count_${currentUserId}`, String(nextFollowingCount));
          localStorage.setItem(`adj_following_${currentUserId}`, JSON.stringify({
            count: nextFollowingCount,
            timestamp: Date.now()
          }));
        }
      } catch (_) {}

      console.error('Follow action exception:', err);
    } finally {
      setFollowLoading(false);
      clearTimeout(cooldownTimer);
      setTimeout(() => setFollowCooldown(false), 6000);
    }
  };

  /* ── Load Followers / Following Modal ── */

  const openFollowModal = async (type: 'followers' | 'following' | 'mutuals') => {
    if (!profile) return;
    setShowModal(type);
    setModalUsers([]);
    setModalCursor(null);
    setModalLoading(true);

    try {
      let url = '';
      if (type === 'followers')  url = `/api/v1/follows/${profile.user_id}/followers?limit=20`;
      if (type === 'following')  url = `/api/v1/follows/${profile.user_id}/following?limit=20`;
      if (type === 'mutuals')    url = `/api/v1/follows/${profile.user_id}/mutual`;

      const res = await api.get(url);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data?.data ?? []);
        const mapped = rawList.map((item: any) => ({
          id: item.follower_id ?? item.following_id
        }));
        setModalUsers(mapped);
        setModalCursor(data?.nextCursor ?? null);
        await enrichProfilesCache(mapped.map((u: any) => u.id));
      }
    } catch (err) {
      console.error('Failed loading follow list:', err);
    } finally {
      setModalLoading(false);
    }
  };

  const loadMoreModalUsers = async () => {
    if (!modalCursor || !profile || !showModal || showModal === 'mutuals') return;
    setModalLoading(true);
    try {
      const type = showModal;
      const url = type === 'followers'
        ? `/api/v1/follows/${profile.user_id}/followers?limit=20&cursor=${encodeURIComponent(modalCursor)}`
        : `/api/v1/follows/${profile.user_id}/following?limit=20&cursor=${encodeURIComponent(modalCursor)}`;

      const res = await api.get(url);
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : (data?.data ?? []);
        const mapped = rawList.map((item: any) => ({
          id: item.follower_id ?? item.following_id
        }));
        setModalUsers(prev => [...prev, ...mapped]);
        setModalCursor(data?.nextCursor ?? null);
        await enrichProfilesCache(mapped.map((u: any) => u.id));
      }
    } finally {
      setModalLoading(false);
    }
  };

  /* ── Load More Posts ── */

  const loadMorePosts = async () => {
    if (!profile || !postsNextCursor || loadingMorePosts) return;
    setLoadingMorePosts(true);
    try {
      const res = await api.get(
        `/api/v1/posts/user/${profile.user_id}?limit=12&cursor=${encodeURIComponent(postsNextCursor)}`
      );
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data?.data ?? []);
        setPosts(prev => [...prev, ...arr]);
        setPostsNextCursor(data?.nextCursor ?? null);
      }
    } finally {
      setLoadingMorePosts(false);
    }
  };

  /* ── Create Post ── */

  const addImageUrl = () => {
    if (!imageInputText.trim()) return;
    setNewMediaUrls(prev => [...prev, imageInputText.trim()]);
    setImageInputText('');
  };

  const removeImageUrl = (index: number) => {
    setNewMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Auto add input buffer if not empty
    let finalUrls = [...newMediaUrls];
    if (imageInputText.trim()) {
      finalUrls.push(imageInputText.trim());
    }

    if (finalUrls.length === 0) {
      setCreatePostError('At least one media URL or file path is required.');
      return;
    }
    setCreatingPost(true);
    setCreatePostError(null);

    try {
      const response = await api.post('/api/v1/posts', {
        caption: newCaption,
        mediaUrls: finalUrls
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to publish post');
      }

      const createdPost: PostData = await response.json();
      
      // Update UI state locally
      setPosts(prev => [createdPost, ...prev]);
      setProfile(prev => prev ? { ...prev, post_count: prev.post_count + 1 } : null);
      
      // Reset & close
      setNewCaption('');
      setNewMediaUrls([]);
      setImageInputText('');
      setShowCreateModal(false);
      
      // If we are on feed, refresh the feed to show our new post
      if (activeTab === 'feed') {
        fetchHomeFeed();
      }
    } catch (err: any) {
      setCreatePostError(err.message || 'Error occurred creating post');
    } finally {
      setCreatingPost(false);
    }
  };

  /* ── Post Details, Likes & Comments ── */

  const openPostDetails = async (post: PostData) => {
    setSelectedPost(post);
    setComments([]);
    setCommentsCursor(null);
    setCommentsLoading(true);
    setSelectedImageIndex(0);

    try {
      const res = await api.get(`/api/v1/posts/${post.id}/comments?limit=15`);
      if (res.ok) {
        const data = await res.json();
        const commentsList = Array.isArray(data) ? data : (data?.data ?? []);
        setComments(commentsList);
        setCommentsCursor(data?.nextCursor ?? null);
        
        // Enrich comments authors profile cards
        const authorIds = commentsList.map((c: any) => c.user_id || c.userId);
        await enrichProfilesCache(authorIds);
      }
    } catch (err) {
      console.error('Failed fetching comments:', err);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleLikeToggle = async (post: PostData) => {
    if (!currentUserId) return;
    const isLiked = !!localLikes[post.id];
    const nextLiked = !isLiked;

    // Optimistically update
    saveLocalLike(post.id, nextLiked);
    
    // Update profile posts array state
    setPosts(prev => prev.map(p => {
      if (p.id === post.id) {
        return { ...p, like_count: Math.max(0, p.like_count + (nextLiked ? 1 : -1)) };
      }
      return p;
    }));

    // Update feed posts array state
    setFeedPosts(prev => prev.map(p => {
      if (p.id === post.id) {
        return { ...p, like_count: Math.max(0, p.like_count + (nextLiked ? 1 : -1)) };
      }
      return p;
    }));

    // Update selected post detail state if open
    if (selectedPost && selectedPost.id === post.id) {
      setSelectedPost(prev => prev ? {
        ...prev,
        like_count: Math.max(0, prev.like_count + (nextLiked ? 1 : -1))
      } : null);
    }

    try {
      await api.post(`/api/v1/posts/${post.id}/like`);
    } catch (err) {
      console.error('Error toggling like status:', err);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !newCommentText.trim() || submittingComment) return;

    setSubmittingComment(true);
    const targetPostId = selectedPost.id;
    const commentBody = newCommentText;

    try {
      const res = await api.post(`/api/v1/posts/${targetPostId}/comments`, {
        content: commentBody
      });

      if (res.ok) {
        const data = await res.json();
        const newComment = data.comment;

        setComments(prev => [newComment, ...prev]);
        setNewCommentText('');

        // Ensure newly posted comment author profile is indexed
        if (currentUserId) {
          await enrichProfilesCache([currentUserId]);
        }

        // Increment counts inside grids
        setPosts(prev => prev.map(p => {
          if (p.id === targetPostId) {
            return { ...p, comment_count: (p.comment_count ?? 0) + 1 };
          }
          return p;
        }));

        setFeedPosts(prev => prev.map(p => {
          if (p.id === targetPostId) {
            return { ...p, comment_count: (p.comment_count ?? 0) + 1 };
          }
          return p;
        }));

        setSelectedPost(prev => prev ? {
          ...prev,
          comment_count: (prev.comment_count ?? 0) + 1
        } : null);
      }
    } catch (err) {
      console.error('Failed submitting comment:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const loadMoreComments = async () => {
    if (!selectedPost || !commentsCursor || commentsLoading) return;
    setCommentsLoading(true);

    try {
      const res = await api.get(
        `/api/v1/posts/${selectedPost.id}/comments?limit=15&cursor=${encodeURIComponent(commentsCursor)}`
      );
      if (res.ok) {
        const data = await res.json();
        const arr = Array.isArray(data) ? data : (data?.data ?? []);
        setComments(prev => [...prev, ...arr]);
        setCommentsCursor(data?.nextCursor ?? null);
        
        const authorIds = arr.map((c: any) => c.user_id || c.userId);
        await enrichProfilesCache(authorIds);
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  /* ── Search debounce ── */

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(`/api/v1/profiles/search?q=${encodeURIComponent(searchQuery)}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data?.data ?? []);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 380);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* ── Profile Update ── */

  const startEditing = () => {
    if (!profile) return;
    setEditUsername(profile.username);
    setEditDisplayName(profile.display_name ?? '');
    setEditBio(profile.bio ?? '');
    setEditProfilePicUrl(profile.profile_pic_url ?? '');
    setEditError(null);
    setEditMode(true);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setUpdating(true);
    setEditError(null);
    try {
      const res = await api.put('/api/v1/profiles/me', {
        username: editUsername,
        displayName: editDisplayName,
        bio: editBio,
        profilePicUrl: editProfilePicUrl
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to update profile');
      }
      const resData = await res.json();
      setProfile(resData.profile);
      setEditMode(false);
    } catch (err: any) {
      setEditError(err.message || 'Could not save changes');
    } finally {
      setUpdating(false);
    }
  };

  /* ── Helpers ── */

  const initials = (name: string) =>
    (name ?? '?').substring(0, 2).toUpperCase();

  // Optimistic adjustments to counter followers discrepancy due to cache delay
  const getAdjustedFollowersCount = () => {
    if (!profile) return 0;
    if (viewedUserId && viewedUserId !== currentUserId) {
      const wasPendingFollow = localFollows[profile.user_id];
      if (wasPendingFollow === true && !isFollowing) {
        // optimistically increment count in UI
        return profile.follower_count + 1;
      }
      if (wasPendingFollow === false && isFollowing) {
        // optimistically decrement count in UI
        return Math.max(0, profile.follower_count - 1);
      }
    }
    return profile.follower_count;
  };

  const getAdjustedFollowingCount = () => {
    if (!profile) return 0;
    if (isOwnProfile) {
      // Check if we have a locally adjusted following count stored within the last 120 seconds
      try {
        const stored = localStorage.getItem(`adj_following_${currentUserId}`);
        if (stored) {
          const { count, timestamp } = JSON.parse(stored);
          if (Date.now() - timestamp < 120000) { // 2 minutes cache
            return count;
          }
        }
      } catch (_) {}
    }
    return profile.following_count;
  };

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */

  return (
    <div className="profile-workspace">
      <div className="bg-glow glow-1"></div>
      <div className="bg-glow glow-2"></div>

      {/* ── Header ── */}
      <header className="workspace-header">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'feed' && !viewedUserId ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', gap: '6px' }}
            onClick={() => {
              setViewedUserId(null);
              setActiveTab('feed');
              setSearchQuery('');
            }}
          >
            <HomeIcon size={16} />
            Feed
          </button>
          
          <button
            className={`btn ${activeTab === 'profile' && !viewedUserId ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', gap: '6px' }}
            onClick={() => {
              setViewedUserId(null);
              setActiveTab('profile');
              setSearchQuery('');
            }}
          >
            <UserIcon size={16} />
            My Profile
          </button>

          <button
            className={`btn ${activeTab === 'chat' && !viewedUserId ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', gap: '6px' }}
            onClick={() => {
              setViewedUserId(null);
              setActiveTab('chat');
              setSearchQuery('');
            }}
          >
            <MessageSquare size={16} />
            Messages
          </button>
        </div>

        {/* Search */}
        <div className="search-container">
          <div className="search-input-wrapper">
            <Search size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search user profiles…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searching && (
              <div className="typing-indicator" style={{ transform: 'scale(0.7)', flexShrink: 0 }}>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="search-results-dropdown glass">
              {searchResults.map(r => (
                <div
                  key={r.user_id}
                  className="search-result-item"
                  onClick={() => {
                    setViewedUserId(r.user_id);
                    setActiveTab('profile');
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                >
                  <div className="mock-avatar" style={{ width: '34px', height: '34px', fontSize: '0.75rem', flexShrink: 0 }}>
                    {r.profile_pic_url
                      ? <img src={r.profile_pic_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      : initials(r.display_name ?? r.username)}
                  </div>
                  <div style={{ textAlign: 'left', lineHeight: '1.3' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.display_name ?? r.username}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{r.username}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-secondary" onClick={logout} style={{ padding: '8px 16px', gap: '6px' }}>
          <LogOut size={16} />
          Sign Out
        </button>
      </header>

      {/* ── CHAT TAB VIEW ── */}
      {activeTab === 'chat' && !viewedUserId && currentUserId && (
        <Chat
          currentUserId={currentUserId}
        />
      )}

      {/* ── HOME FEED TAB VIEW ── */}
      {activeTab === 'feed' && !viewedUserId && (
        <div className="feed-view-section" style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '600px', margin: '0 auto', width: '100%', textAlign: 'left' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700 }}>Home Feed</h2>
            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ gap: '6px' }}>
              <Plus size={16} />
              New Post
            </button>
          </div>

          {feedLoading && feedPosts.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div className="typing-indicator" style={{ scale: '1.4' }}>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          ) : feedError ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: '#ef4444' }}>{feedError}</p>
              <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={fetchHomeFeed}>
                Retry
              </button>
            </div>
          ) : feedPosts.length === 0 ? (
            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <h3>Your feed is empty</h3>
              <p style={{ marginTop: '8px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                Follow other users using the search bar above to see their latest posts appear here!
              </p>
            </div>
          ) : (
            feedPosts.map(post => {
              const author = profilesCache[post.user_id];
              const authorName = author?.display_name ?? author?.username ?? `User ${post.user_id.substring(0, 5)}`;
              const authorAvatar = author?.profile_pic_url ?? null;
              const hasLiked = !!localLikes[post.id];
              const imagesList = post.media_urls ?? (post.media_url ? [post.media_url] : []);
              
              return (
                <div key={post.id} className="glass-card" style={{ padding: '0', overflow: 'hidden', borderRadius: '18px', border: '1px solid var(--border-light)' }}>
                  
                  {/* Feed Item Header */}
                  <div 
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', cursor: 'pointer' }}
                    onClick={() => {
                      setViewedUserId(post.user_id);
                      setActiveTab('profile');
                    }}
                  >
                    <div className="mock-avatar" style={{ width: '38px', height: '38px', fontSize: '0.8rem' }}>
                      {authorAvatar ? (
                        <img src={authorAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : initials(authorName)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{authorName}</div>
                      {author?.username && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{author.username}</div>
                      )}
                    </div>
                  </div>

                  {/* Feed Item Media */}
                  <div style={{ background: '#050508', position: 'relative', width: '100%', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {imagesList.length > 0 ? (
                      <img 
                        src={imagesList[0]} 
                        alt="" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    ) : (
                      <div style={{ fontSize: '3rem' }}>💬</div>
                    )}
                    
                    {imagesList.length > 1 && (
                      <div style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600 }}>
                        1 / {imagesList.length} photos
                      </div>
                    )}
                  </div>

                  {/* Feed Item Actions & Description */}
                  <div style={{ padding: '18px 20px' }}>
                    
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '14px' }}>
                      <button 
                        style={{ background: 'none', border: 'none', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: hasLiked ? '#ff4b4b' : 'var(--text-primary)' }}
                        onClick={() => handleLikeToggle(post)}
                      >
                        <Heart size={20} fill={hasLiked ? '#ff4b4b' : 'none'} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{post.like_count}</span>
                      </button>

                      <button 
                        style={{ background: 'none', border: 'none', padding: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}
                        onClick={() => openPostDetails(post)}
                      >
                        <MessageSquare size={20} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{post.comment_count ?? 0}</span>
                      </button>
                    </div>

                    {/* Caption */}
                    <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                      <span style={{ fontWeight: 700, marginRight: '8px', color: 'var(--text-primary)' }}>{authorName}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{post.caption}</span>
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                      {new Date(post.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </div>

                    {/* Comment quick link */}
                    <button 
                      style={{ background: 'none', border: 'none', padding: '0', marginTop: '12px', fontSize: '0.8rem', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => openPostDetails(post)}
                    >
                      View comments & write reply ↗
                    </button>

                  </div>

                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── PROFILE & TARGET USER PROFILE VIEW ── */}
      {((activeTab === 'profile') || viewedUserId) && (
        <>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
              <div className="typing-indicator" style={{ scale: '1.5' }}>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            </div>
          ) : error || !profile ? (
            <div className="glass-card" style={{ padding: '40px', textAlign: 'center' }}>
              <p style={{ color: '#ef4444' }}>{error ?? 'Profile not found.'}</p>
              <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={() => fetchProfile(viewedUserId)}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* ── Profile Card ── */}
              <div className="profile-card glass">
                {editMode ? (
                  /* Edit Form */
                  <form onSubmit={handleUpdateProfile} className="auth-form" style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Edit Profile</h3>
                    {editError && <div className="error-banner">{editError}</div>}

                    <div className="edit-form-grid">
                      <div className="form-group">
                        <label className="form-label">Username</label>
                        <div className="input-field-wrapper">
                          <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} disabled={updating} required />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Display Name</label>
                        <div className="input-field-wrapper">
                          <input type="text" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} disabled={updating} />
                        </div>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label className="form-label">Profile Picture</label>
                      <div className="input-field-wrapper">
                        <input
                          type="text"
                          placeholder="/uploads/filename.jpg  or  https://example.com/avatar.jpg"
                          value={editProfilePicUrl}
                          onChange={e => setEditProfilePicUrl(e.target.value)}
                          disabled={updating}
                        />
                      </div>
                      {editProfilePicUrl && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img
                            src={editProfilePicUrl}
                            alt="preview"
                            style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-light)' }}
                            onError={e => (e.currentTarget.style.display = 'none')}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Preview</span>
                        </div>
                      )}
                    </div>

                    <div className="form-group" style={{ marginBottom: '24px' }}>
                      <label className="form-label">Bio</label>
                      <div className="input-field-wrapper" style={{ padding: '8px 12px' }}>
                        <textarea
                          rows={3}
                          value={editBio}
                          onChange={e => setEditBio(e.target.value)}
                          disabled={updating}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', resize: 'none', fontFamily: 'var(--font-sans)', fontSize: '0.95rem' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button type="submit" className="btn btn-primary" disabled={updating}>
                        <Check size={16} />
                        {updating ? 'Saving…' : 'Save Profile'}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditMode(false)} disabled={updating}>
                        <X size={16} />
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  /* View Mode */
                  <div className="profile-identity">
                    <div className="profile-avatar-large">
                      {profile.profile_pic_url
                        ? <img src={profile.profile_pic_url} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                        : initials(profile.display_name ?? profile.username)}
                    </div>

                    <div className="profile-details">
                      <div className="profile-title-row">
                        <span className="profile-name">{profile.display_name ?? profile.username}</span>
                        {profile.is_celebrity && (
                          <span className="celebrity-badge">
                            <Star size={12} fill="#fff" />
                            Celebrity
                          </span>
                        )}
                      </div>
                      <div className="profile-username">@{profile.username}</div>

                      {/* Stats — clickable to open modal */}
                      <div className="profile-stats">
                        <div className="stat-item">
                          <span className="stat-val">{profile.post_count}</span>
                          <span className="stat-lbl">Posts</span>
                        </div>
                        <div
                          className="stat-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => openFollowModal('followers')}
                          title="View followers"
                        >
                          <span className="stat-val">{getAdjustedFollowersCount()}</span>
                          <span className="stat-lbl" style={{ color: 'var(--accent-primary)' }}>Followers ↗</span>
                        </div>
                        <div
                          className="stat-item"
                          style={{ cursor: 'pointer' }}
                          onClick={() => openFollowModal('following')}
                          title="View following"
                        >
                          <span className="stat-val">{getAdjustedFollowingCount()}</span>
                          <span className="stat-lbl" style={{ color: 'var(--accent-primary)' }}>Following ↗</span>
                        </div>
                        {!isOwnProfile && (
                          <div
                            className="stat-item"
                            style={{ cursor: 'pointer' }}
                            onClick={() => openFollowModal('mutuals')}
                            title="View mutual follows"
                          >
                            <Users size={16} style={{ color: 'var(--text-secondary)' }} />
                            <span className="stat-lbl" style={{ color: 'var(--accent-secondary)' }}>Mutuals ↗</span>
                          </div>
                        )}
                      </div>

                      <p className="profile-bio">{profile.bio ?? 'No bio yet.'}</p>

                      <div className="profile-actions">
                        {isOwnProfile ? (
                          <>
                            <button className="btn btn-secondary" onClick={startEditing} style={{ gap: '6px' }}>
                              <Edit3 size={16} />
                              Edit Profile
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ gap: '6px' }}>
                              <Plus size={16} />
                              New Post
                            </button>
                          </>
                        ) : (
                          <button
                            className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`}
                            onClick={handleFollowToggle}
                            disabled={followLoading || followCooldown}
                            title={followCooldown ? 'Please wait a moment before changing follow status again' : ''}
                            style={{ gap: '6px', opacity: followCooldown ? 0.7 : 1, transition: 'opacity 0.3s' }}
                          >
                            {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
                            {followCooldown && !followLoading
                              ? (isFollowing ? 'Following ✓' : 'Follow')
                              : followLoading ? '…'
                              : isFollowing ? 'Following' : 'Follow'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Posts Grid ── */}
              <div className="posts-grid-section">
                <h3 className="posts-section-title">
                  <Grid size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'text-bottom' }} />
                  Posts
                </h3>

                {posts.length === 0 ? (
                  <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No posts published yet.
                  </div>
                ) : (
                  <>
                    <div className="posts-grid">
                      {posts.map(post => {
                        const imgUrl = getPostImageUrl(post);
                        const isLiked = !!localLikes[post.id];
                        const imagesList = post.media_urls ?? (post.media_url ? [post.media_url] : []);
                        
                        return (
                          <div
                            key={post.id}
                            className="post-grid-card glass"
                            onClick={() => openPostDetails(post)}
                            style={{ cursor: 'pointer' }}
                          >
                            {imgUrl ? (
                              <img src={imgUrl} className="post-media" alt="" />
                            ) : (
                              <div className="post-image-placeholder">
                                <span>💬</span>
                              </div>
                            )}

                            {/* Stack icon for multi-image posts */}
                            {imagesList.length > 1 && (
                              <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(10, 11, 16, 0.8)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <ImageIcon size={10} />
                                <span>+{imagesList.length - 1}</span>
                              </div>
                            )}

                            <div className="post-caption-overlay">
                              <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                {post.caption}
                              </p>
                              <div className="post-likes-info" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Heart size={12} fill={isLiked ? '#ff4b4b' : 'none'} style={{ color: isLiked ? '#ff4b4b' : 'currentColor' }} />
                                  <span>{post.like_count} Likes</span>
                                </div>
                                {post.comment_count !== undefined && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <MessageSquare size={12} />
                                    <span>{post.comment_count}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {postsNextCursor && (
                      <div style={{ textAlign: 'center', marginTop: '32px' }}>
                        <button className="btn btn-secondary" onClick={loadMorePosts} disabled={loadingMorePosts} style={{ gap: '8px' }}>
                          <ChevronDown size={16} />
                          {loadingMorePosts ? 'Loading…' : 'Load More Posts'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Followers / Following / Mutuals Modal ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(null); }}
        >
          <div className="glass" style={{ borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '400px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, textTransform: 'capitalize' }}>
                {showModal === 'mutuals' ? 'Mutual Follows' : showModal}
              </h3>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setShowModal(null)}>
                <X size={14} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {modalLoading && modalUsers.length === 0 ? (
                <div className="typing-indicator" style={{ margin: '24px auto' }}>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              ) : modalUsers.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                  No users found.
                </p>
              ) : (
                modalUsers.map((u, i) => {
                  const p = profilesCache[u.id];
                  const displayName = p?.display_name ?? p?.username ?? null;
                  const picUrl = p?.profile_pic_url ?? null;
                  const uname = p?.username ?? null;
                  return (
                    <div
                      key={`${u.id}-${i}`}
                      className="search-result-item"
                      style={{ border: '1px solid var(--border-light)', borderRadius: '10px', cursor: 'pointer' }}
                      onClick={() => {
                        setViewedUserId(u.id);
                        setShowModal(null);
                      }}
                    >
                      <div className="mock-avatar" style={{ width: '40px', height: '40px', fontSize: '0.8rem', flexShrink: 0, overflow: 'hidden' }}>
                        {picUrl
                          ? <img src={picUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          : (displayName ?? u.id ?? '?').substring(0, 2).toUpperCase()
                        }
                      </div>
                      <div style={{ textAlign: 'left', lineHeight: '1.3' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {displayName ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}>Loading…</span>}
                        </div>
                        {uname && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{uname}</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Load more button for followers/following */}
            {modalCursor && showModal !== 'mutuals' && (
              <button className="btn btn-secondary" onClick={loadMoreModalUsers} disabled={modalLoading} style={{ gap: '8px', marginTop: '4px' }}>
                <ChevronDown size={14} />
                {modalLoading ? 'Loading…' : 'Load More'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Create Post Modal ── */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="glass" style={{ borderRadius: '24px', padding: '32px', width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create New Post</h3>
              <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setShowCreateModal(false)}>
                <X size={16} />
              </button>
            </div>

            {createPostError && <div className="error-banner">{createPostError}</div>}

            <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ textAlign: 'left' }}>
                <label className="form-label">Add Media URLs / Upload Paths</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div className="input-field-wrapper" style={{ flex: 1 }}>
                    <input
                      type="text"
                      placeholder="e.g. /uploads/photo.jpg or URL"
                      value={imageInputText}
                      onChange={e => setImageInputText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addImageUrl();
                        }
                      }}
                    />
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={addImageUrl}>Add</button>
                </div>
                
                {/* List of currently added images */}
                {newMediaUrls.length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {newMediaUrls.map((url, index) => (
                      <div key={index} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => removeImageUrl(index)}
                          style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', color: '#fff', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px' }}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group" style={{ textAlign: 'left' }}>
                <label className="form-label">Caption</label>
                <div className="input-field-wrapper" style={{ padding: '10px 14px' }}>
                  <textarea
                    rows={4}
                    placeholder="Describe your post..."
                    value={newCaption}
                    onChange={e => setNewCaption(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', resize: 'none', fontFamily: 'var(--font-sans)', fontSize: '0.95rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={creatingPost}>
                  {creatingPost ? 'Publishing…' : 'Share Post'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)} disabled={creatingPost}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Post Details Modal ── */}
      {selectedPost && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px'
          }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedPost(null); }}
        >
          <div className="glass post-details-dialog" style={{ borderRadius: '24px', overflow: 'hidden', width: '100%', maxWidth: '950px', display: 'flex', height: '80vh', border: '1px solid var(--border-light)' }}>
            
            {/* Left Column: Post Media (with multi-image carousel support) */}
            <div className="post-details-media-container" style={{ flex: '1.2', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderRight: '1px solid var(--border-light)' }}>
              {(() => {
                const images = selectedPost.media_urls ?? (selectedPost.media_url ? [selectedPost.media_url] : []);
                if (images.length === 0) {
                  return <div style={{ fontSize: '4rem' }}>💬</div>;
                }
                return (
                  <>
                    <img
                      src={images[selectedImageIndex]}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    
                    {/* Carousel Navigation Arrows */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setSelectedImageIndex(prev => (prev - 1 + images.length) % images.length)}
                          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(10, 11, 16, 0.7)', border: 'none', borderRadius: '50%', color: '#fff', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        
                        <button
                          onClick={() => setSelectedImageIndex(prev => (prev + 1) % images.length)}
                          style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(10, 11, 16, 0.7)', border: 'none', borderRadius: '50%', color: '#fff', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                        >
                          <ChevronRight size={20} />
                        </button>
                        
                        {/* Dot indicator */}
                        <div style={{ position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
                          {images.map((_, i) => (
                            <div
                              key={i}
                              style={{ width: '6px', height: '6px', borderRadius: '50%', background: i === selectedImageIndex ? 'var(--accent-primary)' : 'rgba(255,255,255,0.4)', transition: 'background 0.2s' }}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Right Column: Author, Caption, Comments, Actions */}
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(10, 11, 16, 0.95)' }}>
              
              {/* Author Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="mock-avatar" style={{ width: '38px', height: '38px', fontSize: '0.8rem', flexShrink: 0 }}>
                    {profile?.profile_pic_url ? <img src={profile.profile_pic_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials(profile?.display_name ?? profile?.username ?? '')}
                  </div>
                  <div style={{ textAlign: 'left', lineHeight: '1.3' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {profile?.display_name ?? profile?.username}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{profile?.username}</div>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setSelectedPost(null)}>
                  <X size={16} />
                </button>
              </div>

              {/* Comments Panel */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                {/* Author's Original Caption */}
                {selectedPost.caption && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px dashed var(--border-light)' }}>
                    <div className="mock-avatar" style={{ width: '30px', height: '30px', fontSize: '0.7rem', flexShrink: 0 }}>
                      {profile?.profile_pic_url ? <img src={profile.profile_pic_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : initials(profile?.display_name ?? profile?.username ?? '')}
                    </div>
                    <div style={{ textAlign: 'left', fontSize: '0.9rem' }}>
                      <span style={{ fontWeight: 700, marginRight: '8px', color: 'var(--text-primary)' }}>
                        {profile?.display_name ?? profile?.username}
                      </span>
                      <span style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{selectedPost.caption}</span>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                        {new Date(selectedPost.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Comments List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
                  {commentsLoading && comments.length === 0 ? (
                    <div className="typing-indicator" style={{ margin: '20px auto' }}>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                      <div className="typing-dot"></div>
                    </div>
                  ) : comments.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '32px 0' }}>
                      No comments yet. Be the first to reply!
                    </p>
                  ) : (
                    <>
                      {comments.map((comment) => {
                        const commentUserId = comment.user_id || (comment as any).userId;
                        const commentCreatedAt = comment.created_at || (comment as any).createdAt;
                        
                        // Extract enriched profile metadata from cache
                        const cachedUser = profilesCache[commentUserId];
                        const commentDisplayName = cachedUser?.display_name ?? cachedUser?.username ?? `User ${commentUserId.substring(0, 5)}`;
                        const commentAvatar = cachedUser?.profile_pic_url ?? null;
                        
                        return (
                          <div key={comment.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div className="mock-avatar" style={{ width: '30px', height: '30px', fontSize: '0.7rem', flexShrink: 0 }}>
                              {commentAvatar ? (
                                <img src={commentAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                              ) : commentDisplayName.substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{ textAlign: 'left', fontSize: '0.85rem' }}>
                              <span style={{ fontWeight: 700, marginRight: '6px', color: 'var(--text-primary)' }}>
                                {commentDisplayName}
                              </span>
                              <span style={{ color: 'var(--text-secondary)' }}>{comment.content}</span>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {new Date(commentCreatedAt).toLocaleDateString(undefined, { dateStyle: 'short' })}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {commentsCursor && (
                        <button
                          className="btn btn-secondary"
                          onClick={loadMoreComments}
                          disabled={commentsLoading}
                          style={{ margin: '8px auto 0', padding: '6px 14px', fontSize: '0.8rem', gap: '6px' }}
                        >
                          <ChevronDown size={14} />
                          Load older comments
                        </button>
                      )}
                    </>
                  )}
                </div>

              </div>

              {/* Actions Box */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {selectedPost.like_count} Likes
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(selectedPost.created_at).toLocaleDateString(undefined, { dateStyle: 'long' })}
                  </div>
                </div>

                <button
                  className="btn btn-secondary"
                  style={{
                    padding: '8px 14px',
                    borderColor: localLikes[selectedPost.id] ? '#ff4b4b' : 'var(--border-light)',
                    color: localLikes[selectedPost.id] ? '#ff4b4b' : 'var(--text-primary)'
                  }}
                  onClick={() => handleLikeToggle(selectedPost)}
                >
                  <Heart size={16} fill={localLikes[selectedPost.id] ? '#ff4b4b' : 'none'} />
                  {localLikes[selectedPost.id] ? 'Liked' : 'Like'}
                </button>
              </div>

              {/* Write Comment Form */}
              <form onSubmit={handleCommentSubmit} className="input-area" style={{ padding: '14px 20px', borderTop: '1px solid var(--border-light)', borderRadius: 0, background: 'transparent' }}>
                <input
                  type="text"
                  placeholder="Write a comment..."
                  value={newCommentText}
                  onChange={e => setNewCommentText(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: '0.9rem' }}
                />
                <button type="submit" className="send-btn" disabled={!newCommentText.trim() || submittingComment} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)' }}>
                  <Send size={16} />
                </button>
              </form>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}
