import { useAuth } from '@/context/AuthContext';
import {
  deleteConversationIfEmpty,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
  type MessageWithId,
} from '@/services/messagingService';
import { getUser } from '@/services/userService';
import type { User } from '@/types/user';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Timestamp } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function formatMessageTime(ts: Timestamp): string {
  const date = ts.toDate();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationScreen() {
  const { id: conversationId, otherUserId, pending } = useLocalSearchParams<{
    id: string;
    otherUserId: string;
    pending?: string;
  }>();
  const { user } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<MessageWithId[]>([]);
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  // Tracks whether the Firestore conversation doc has been created yet.
  const isPendingRef = useRef(pending === 'true');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!otherUserId) return;
    getUser(otherUserId).then(setOtherUser).catch(console.error);
  }, [otherUserId]);

  useEffect(() => {
    if (!conversationId || !user) return;

    // If the conversation is pending, there's no Firestore doc yet — skip
    // markConversationRead and the message listener until the first send.
    if (isPendingRef.current) {
      return;
    }

    markConversationRead(conversationId, user.uid).catch(console.error);

    const unsub = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    return unsub;
  }, [conversationId, user]);

  const handleBack = async () => {
    // Clean up the conversation doc if the user navigates away without sending.
    if (conversationId && !isPendingRef.current) {
      await deleteConversationIfEmpty(conversationId).catch(console.error);
    }
    router.back();
  };

  const handleSend = async () => {
    if (!inputText.trim() || !user || !conversationId || !otherUserId || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    const wasPending = isPendingRef.current;
    try {
      await sendMessage(conversationId, user.uid, otherUserId, text, wasPending);
      if (wasPending) {
        // Doc now exists — start the real-time listener.
        isPendingRef.current = false;
        markConversationRead(conversationId, user.uid).catch(console.error);
        const unsub = subscribeToMessages(conversationId, (msgs) => {
          setMessages(msgs);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        });
        // Store unsub so it cleans up when the screen unmounts.
        return () => unsub();
      }
    } catch (e) {
      console.error('Failed to send message:', e);
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }: { item: MessageWithId }) => {
    const isMe = item.senderId === user?.uid;
    return (
      <View style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowThem]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.text}
          </Text>
          {item.sentAt && (
            <Text style={[styles.timeText, isMe ? styles.timeTextMe : styles.timeTextThem]}>
              {formatMessageTime(item.sentAt)}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerAvatar}>
            <Ionicons name="person" size={22} color="#999" />
          </View>
          <Text style={styles.headerName}>{otherUser?.name ?? '...'}</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Messages */}
      <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Send a message to start the conversation
              </Text>
            </View>
          }
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Message..."
          placeholderTextColor="#aaa"
          multiline
          maxLength={1000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending}
        >
          <Ionicons name="send" size={20} color={inputText.trim() ? '#007AFF' : '#ccc'} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 44,
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  messageRow: {
    marginBottom: 8,
    flexDirection: 'row',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
  },
  messageRowThem: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextMe: {
    color: '#fff',
  },
  bubbleTextThem: {
    color: '#333',
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  timeTextMe: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'right',
  },
  timeTextThem: {
    color: '#aaa',
  },
  emptyState: {
    flex: 1,
    paddingTop: 80,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#aaa',
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#333',
  },
  sendButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
