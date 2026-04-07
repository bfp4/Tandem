import { useAuth } from '@/context/AuthContext';
import { subscribeToConversations, type ConversationWithId } from '@/services/messagingService';
import { getUser } from '@/services/userService';
import type { User } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface ConversationRow {
  conversationId: string;
  otherUser: User;
  otherUserId: string;
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  unread: number;
}

function formatTime(ts: Timestamp | null): string {
  if (!ts) return '';
  const date = ts.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d`;
}

export default function ChatScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const userCacheRef = useRef<Record<string, User>>({});

  useEffect(() => {
    if (!user) return;

    const unsub = subscribeToConversations(
      user.uid,
      async (conversations) => {
        const enriched = await Promise.all(
          conversations.map(async (conv: ConversationWithId) => {
            const otherUserId = conv.participants.find((p) => p !== user.uid) ?? '';
            if (!userCacheRef.current[otherUserId]) {
              try {
                userCacheRef.current[otherUserId] = await getUser(otherUserId);
              } catch {
                return null;
              }
            }
            const otherUser = userCacheRef.current[otherUserId];
            return {
              conversationId: conv.id,
              otherUser,
              otherUserId,
              lastMessage: conv.lastMessage,
              lastMessageAt: conv.lastMessageAt,
              unread: conv.unreadCounts?.[user.uid] ?? 0,
            } satisfies ConversationRow;
          }),
        );
        setRows(enriched.filter((r): r is ConversationRow => r !== null));
        setLoading(false);
      },
      () => {
        // Snapshot errored (e.g. permission denied) — stop the spinner
        setLoading(false);
      },
    );

    return unsub;
  }, [user]);

  const renderItem = ({ item }: { item: ConversationRow }) => (
    <TouchableOpacity
      style={styles.chatCard}
      onPress={() =>
        router.push({
          pathname: '/conversation/[id]',
          params: { id: item.conversationId, otherUserId: item.otherUserId },
        })
      }
    >
      <View style={styles.avatar}>
        <Ionicons name="person" size={28} color="#999" />
      </View>
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName}>{item.otherUser.name}</Text>
          <Text style={styles.chatTime}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.messageRow}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage || 'No messages yet'}
          </Text>
          {item.unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>No messages yet</Text>
          <Text style={styles.emptySubtext}>
            Start a conversation with your matches
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.conversationId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  chatTime: {
    fontSize: 12,
    color: '#999',
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: '#666',
  },
  unreadBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
  },
});
