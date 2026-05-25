import {
  ACCENT,
  ACCENT_LIGHT,
  BG,
  BORDER,
  BORDER_DEFAULT,
  BORDER_LIGHT,
  CARD_BG,
  GREEN,
  ORANGE,
  PLACEHOLDER,
  RED,
  SHADOW,
  STAR_COLOR,
  TEXT_INVERSE,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  TEXT_TERTIARY,
} from '@/utils/constants';
import Avatar from '@/components/Avatar';
import EmptyState from '@/components/EmptyState';
import LoadingScreen from '@/components/LoadingScreen';
import ScreenHeader from '@/components/ScreenHeader';
import { useAuth } from '@/context/AuthContext';
import { subscribeToConversations, type ConversationWithId } from '@/services/messagingService';
import { getUser } from '@/services/userService';
import type { User } from '@/types/user';
import { formatTime } from '@/utils/formatTime';
import { useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
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
      <Avatar uri={item.otherUser.profilePhoto} size={56} style={{ marginRight: 12 }} />
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
    return <LoadingScreen />;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Messages" />

      {rows.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No messages yet"
          subtitle="Start a conversation with your matches"
        />
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
    backgroundColor: BG,
  },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
    color: TEXT_PRIMARY,
  },
  chatTime: {
    fontSize: 12,
    color: TEXT_MUTED,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: TEXT_TERTIARY,
  },
  unreadBadge: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadText: {
    color: TEXT_INVERSE,
    fontSize: 12,
    fontWeight: 'bold',
  },
});
