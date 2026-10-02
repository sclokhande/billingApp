import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import {
  Modal,
  Portal,
  Text,
  TextInput,
  IconButton,
  Button,
  useTheme,
  Chip,
  Card,
  Avatar,
  Divider,
} from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { useBilling } from '../context/BillingContext';
import { AgentMessage, AgentAction, ActiveOrderSession } from '../ai/types';
import { Invoice, InvoiceItem } from '../db/types';
import { dispatchAgentQuery } from '../ai/agentDispatcher';
import { QUICK_PROMPTS } from '../ai/quickPrompts';
import { voiceService } from '../services/voiceService';

interface AiAssistantModalProps {
  visible: boolean;
  onDismiss: () => void;
  navigation: any;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const VOICE_SAMPLES = [
  'Bhau 1 kg apple karun dya',
  'Bhaiya 1 kg apple kar do',
  'Dada 2 kilo tandul aani 1 tel lihun ghya',
  'Aaj cha sale kiti jhala',
  'Konache paise baki ahet',
  'Shevatche bill print kara',
];

const FinalBillPreviewCard: React.FC<{
  data: any;
  currency: string;
  onPrint: () => void;
  onOpenBuilder: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}> = ({ data, currency, onPrint, onOpenBuilder, onCancel, isProcessing }) => {
  const theme = useTheme() as any;
  if (!data) return null;

  const isPaid = data.paymentStatus === 'Paid';

  return (
    <Card style={styles.finalBillCard} mode="outlined">
      <Card.Content style={{ padding: 12, gap: 8 }}>
        <View style={styles.finalBillHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <MaterialCommunityIcons name="receipt-text-outline" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
              Final Bill Summary
            </Text>
          </View>
          <Chip
            compact
            mode="flat"
            style={{
              backgroundColor: isPaid ? '#E8F5E9' : '#FFF3E0',
            }}
            textStyle={{
              fontSize: 11,
              fontWeight: 'bold',
              color: isPaid ? '#2E7D32' : '#E65100',
            }}
          >
            {isPaid ? '✅ Paid' : '⚠️ Unpaid'} • {data.paymentMethod || 'Cash'}
          </Chip>
        </View>

        <Divider />

        {/* Customer info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="bodySmall" style={{ color: '#666' }}>Customer:</Text>
          <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>
            {data.customer?.name || 'Walkin-customer'}
          </Text>
        </View>

        {/* Items list */}
        <View style={{ gap: 4, marginVertical: 2 }}>
          {data.items?.map((it: any, idx: number) => (
            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodySmall" style={{ flex: 1 }}>
                {idx + 1}. {it.name} <Text style={{ color: '#666' }}>({it.quantity} {it.unit})</Text>
              </Text>
              <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                {currency}{(it.total || it.price * it.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        <Divider />

        {/* Totals */}
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="bodySmall" style={{ color: '#666' }}>Subtotal:</Text>
            <Text variant="bodySmall">{currency}{Number(data.subtotal || 0).toFixed(2)}</Text>
          </View>

          {Boolean(data.discount && data.discount > 0) && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodySmall" style={{ color: '#2E7D32' }}>
                Discount ({data.discountPct || 0}%):
              </Text>
              <Text variant="bodySmall" style={{ color: '#2E7D32', fontWeight: 'bold' }}>
                -{currency}{Number(data.discount).toFixed(2)}
              </Text>
            </View>
          )}

          {Boolean(data.taxTotal && data.taxTotal > 0) && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodySmall" style={{ color: '#666' }}>GST Tax:</Text>
              <Text variant="bodySmall">{currency}{Number(data.taxTotal).toFixed(2)}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Grand Total:</Text>
            <Text variant="titleMedium" style={{ fontWeight: 'bold', color: theme.colors.primary }}>
              {currency}{Number(data.grandTotal || 0).toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 6, marginTop: 4 }}>
          <Button
            mode="contained"
            icon="printer"
            buttonColor={theme.colors.success || '#2E7D32'}
            textColor="#FFFFFF"
            loading={isProcessing}
            disabled={isProcessing}
            onPress={onPrint}
            style={{ borderRadius: 8 }}
          >
            Generate & Print Bill ({currency}{Number(data.grandTotal || 0).toFixed(2)})
          </Button>

          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button
              mode="outlined"
              icon="pencil-outline"
              compact
              style={{ flex: 1, borderRadius: 8 }}
              onPress={onOpenBuilder}
            >
              Open in Builder
            </Button>
            <Button
              mode="text"
              icon="close-circle-outline"
              textColor={theme.colors.error}
              compact
              onPress={onCancel}
            >
              Cancel
            </Button>
          </View>
        </View>
      </Card.Content>
    </Card>
  );
};

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  visible,
  onDismiss,
  navigation,
}) => {
  const theme = useTheme() as any;
  const billing = useBilling();
  const scrollViewRef = useRef<ScrollView>(null);

  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<'mr-IN' | 'hi-IN' | 'en-IN'>('mr-IN');
  const [activeOrderSession, setActiveOrderSession] = useState<ActiveOrderSession | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'msg_welcome',
      sender: 'assistant',
      text: `👋 Hello! I am your **Parchiwala Offline Assistant**.\n\nI can help you check sales, track inventory, find unpaid bills, and print receipts without needing an internet connection.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actions: [
        {
          id: 'act_quick_sales',
          label: "Check Today's Sales",
          type: 'NAVIGATE',
          payload: { screen: 'Dashboard' },
          icon: 'cash-register',
        },
      ],
    },
  ]);

  // Voice listener setup
  useEffect(() => {
    voiceService.setListeners({
      onSpeechStart: () => {
        setIsListening(true);
        setVoiceError(null);
      },
      onSpeechEnd: () => {
        setIsListening(false);
      },
      onSpeechPartial: (partialText: string) => {
        if (partialText) {
          setInputQuery(partialText);
        }
      },
      onSpeechRecognized: (text: string) => {
        setIsListening(false);
        setVoiceError(null);
        if (text && text.trim().length > 0) {
          setInputQuery(text);
          handleSendMessage(text);
        }
      },
      onSpeechError: (err: string) => {
        setIsListening(false);
        setVoiceError(err);
      },
    });

    return () => {
      voiceService.destroy();
    };
  }, []);

  const handleToggleVoice = async () => {
    if (isListening) {
      await voiceService.stopListening();
      setIsListening(false);
    } else {
      setVoiceError(null);
      voiceService.setLocale(selectedLocale);
      const ok = await voiceService.startListening(selectedLocale);
      if (ok) {
        setIsListening(true);
      }
    }
  };

  const handleSelectLocale = (loc: 'mr-IN' | 'hi-IN' | 'en-IN') => {
    setSelectedLocale(loc);
    voiceService.setLocale(loc);
    if (isListening) {
      voiceService.startListening(loc);
    }
  };

  // Auto-scroll when messages change
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, visible]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query || isProcessing) return;

    setInputQuery('');
    const userMsg: AgentMessage = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const response = await dispatchAgentQuery(query, {
        invoices: billing.invoices,
        products: billing.products,
        customers: billing.customers,
        organization: billing.organization,
        connectedPrinter: billing.connectedPrinter,
        orderSession: activeOrderSession,
        onNavigate: (screen, params) => {
          onDismiss();
          navigation.navigate(screen, params);
        },
      });

      if (response.orderSession !== undefined) {
        setActiveOrderSession(response.orderSession);
      }

      const assistantMsg: AgentMessage = {
        id: `ai_${Date.now()}`,
        sender: 'assistant',
        text: response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: response.actions,
        cardType: response.cardType,
        cardData: response.cardData,
        suggestedFollowUps: response.suggestedFollowUps,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Check if this is an auto-create & print action (e.g. "create a bill for 1 kg apple")
      const autoPrintAction = response.actions?.find((a) => a.type === 'AUTO_PRINT_PREVIEW');
      if (autoPrintAction && response.cardType !== 'FINAL_BILL_PREVIEW') {
        await handleActionPress(autoPrintAction);
        return;
      }
    } catch (_e) {
      const errorMsg: AgentMessage = {
        id: `err_${Date.now()}`,
        sender: 'assistant',
        text: `Sorry, I encountered an issue processing your request. Please try again.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActionPress = async (action: AgentAction) => {
    if (action.type === 'PROCEED_FOR_BILL') {
      handleSendMessage('Generate Bill');
      return;
    }

    if (action.type === 'ADD_PRODUCT') {
      handleSendMessage('+ Add Product');
      return;
    }

    if (action.type === 'CANCEL_ORDER') {
      setActiveOrderSession(null);
      const cancelMsg: AgentMessage = {
        id: `cancel_${Date.now()}`,
        sender: 'assistant',
        text: '❌ **Order cancelled.** Your current cart has been cleared.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, cancelMsg]);
      return;
    }

    if (action.type === 'AUTO_PRINT_PREVIEW') {
      const draft = action.payload;
      if (!draft || !draft.items || draft.items.length === 0) return;

      setIsProcessing(true);
      try {
        const year = new Date().getFullYear();
        const count = billing.invoices.length + 1;
        const invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;
        const invoiceId = Math.random().toString(36).substring(2, 15);

        const invoiceData: Invoice = {
          id: invoiceId,
          invoiceNumber,
          customerId: draft.customer?.id || 'default_customer',
          date: new Date().toISOString(),
          subtotal: draft.subtotal,
          taxTotal: draft.taxTotal,
          cgstTotal: draft.cgstTotal,
          sgstTotal: draft.sgstTotal,
          discount: draft.discount || 0,
          grandTotal: draft.grandTotal,
          paymentStatus: draft.paymentStatus || 'Paid',
          paymentMethod: draft.paymentMethod || 'Cash',
        };

        const invoiceItems: InvoiceItem[] = draft.items.map((item: any) => ({
          id: Math.random().toString(36).substring(2, 15),
          invoiceId,
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          taxRate: item.taxRate,
          total: item.total,
          unit: item.unit,
        }));

        await billing.createInvoice(invoiceData, invoiceItems);

        // Close modal and directly navigate to Print Preview screen!
        onDismiss();
        navigation.navigate('PrintPreview', { invoiceId, invoice: invoiceData, items: invoiceItems });
      } catch (err: any) {
        console.error('Error auto-creating invoice:', err);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (action.type === 'CONFIRM_DRAFT') {
      const draft = action.payload;
      if (!draft || !draft.items || draft.items.length === 0) return;

      setIsProcessing(true);
      try {
        const year = new Date().getFullYear();
        const count = billing.invoices.length + 1;
        const invoiceNumber = `INV-${year}-${String(count).padStart(4, '0')}`;
        const invoiceId = Math.random().toString(36).substring(2, 15);

        const invoiceData: Invoice = {
          id: invoiceId,
          invoiceNumber,
          customerId: draft.customer?.id || 'default_customer',
          date: new Date().toISOString(),
          subtotal: draft.subtotal,
          taxTotal: draft.taxTotal,
          cgstTotal: draft.cgstTotal,
          sgstTotal: draft.sgstTotal,
          discount: draft.discount || 0,
          grandTotal: draft.grandTotal,
          paymentStatus: draft.paymentStatus || 'Paid',
          paymentMethod: draft.paymentMethod || 'Cash',
        };

        const invoiceItems: InvoiceItem[] = draft.items.map((item: any) => ({
          id: Math.random().toString(36).substring(2, 15),
          invoiceId,
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          taxRate: item.taxRate,
          total: item.total,
          unit: item.unit,
        }));

        await billing.createInvoice(invoiceData, invoiceItems);

        const successMsg: AgentMessage = {
          id: `created_${Date.now()}`,
          sender: 'assistant',
          text:
            `🎉 **Order Placed & Bill #${invoiceNumber} Created!**\n\n` +
            `• **Customer**: ${draft.customer?.name || 'Walkin-customer'}\n` +
            `• **Amount**: ${billing.organization.currency || '₹'}${draft.grandTotal.toFixed(2)}\n` +
            `• **Payment**: ✅ ${draft.paymentStatus || 'Paid'} (${draft.paymentMethod || 'Cash'})\n\n` +
            `Stock quantities have been automatically updated.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          actions: [
            {
              id: 'act_print_now',
              label: `Print Bill #${invoiceNumber}`,
              type: 'PRINT_INVOICE',
              payload: { invoiceId },
              icon: 'printer',
            },
            {
              id: 'act_view_bill',
              label: 'View Invoice Details',
              type: 'VIEW_INVOICE',
              payload: { invoiceId },
              icon: 'eye-outline',
            },
          ],
        };

        setMessages((prev) => [...prev, successMsg]);
      } catch (err: any) {
        const errorMsg: AgentMessage = {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ Could not complete order: ${err?.message || 'Error occurred while saving to database.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    onDismiss();
    switch (action.type) {
      case 'NAVIGATE':
        if (action.payload?.screen) {
          navigation.navigate(action.payload.screen, action.payload.params);
        }
        break;
      case 'VIEW_INVOICE':
        if (action.payload?.invoiceId) {
          navigation.navigate('InvoiceDetail', { invoiceId: action.payload.invoiceId });
        }
        break;
      case 'PRINT_INVOICE':
        if (action.payload?.invoiceId) {
          const isReady = await billing.verifyPrinterConnectionOrRedirect(navigation);
          if (isReady) {
            navigation.navigate('PrintPreview', { invoiceId: action.payload.invoiceId });
          }
        }
        break;
      case 'OPEN_BILLING':
        navigation.navigate('Billing', action.payload);
        break;
      default:
        break;
    }
  };

  const createAndPrintInvoice = async (invoiceData: Invoice, invoiceItems: InvoiceItem[]) => {
    setIsProcessing(true);
    try {
      await billing.createInvoice(invoiceData, invoiceItems);

      const successMsg: AgentMessage = {
        id: `created_${Date.now()}`,
        sender: 'assistant',
        text:
          `🎉 **Bill #${invoiceData.invoiceNumber} Generated!**\n\n` +
          `• **Customer**: ${invoiceData.customerId === 'default_customer' ? 'Walk-in Customer' : 'Customer'}\n` +
          `• **Amount**: ${billing.organization.currency || '₹'}${invoiceData.grandTotal.toFixed(2)}\n` +
          `• **Payment**: ${invoiceData.paymentStatus === 'Paid' ? '✅ Paid' : '⚠️ Unpaid'} (${invoiceData.paymentMethod})\n\n` +
          `Opening Print Preview...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: [
          {
            id: 'act_print_now',
            label: `Print Bill #${invoiceData.invoiceNumber}`,
            type: 'PRINT_INVOICE',
            payload: { invoiceId: invoiceData.id },
            icon: 'printer',
          },
        ],
      };
      setMessages((prev) => [...prev, successMsg]);

      const isReady = await billing.verifyPrinterConnectionOrRedirect(navigation);
      if (isReady) {
        onDismiss();
        navigation.navigate('PrintPreview', {
          invoiceId: invoiceData.id,
          invoice: invoiceData,
          items: invoiceItems,
        });
      } else {
        onDismiss();
      }
    } catch (err: any) {
      console.error('Error creating invoice from AI fast bill:', err);
      Alert.alert('Billing Error', err?.message || 'Failed to save invoice.');
    } finally {
      setIsProcessing(false);
    }
  };

  const openInvoiceBuilder = (params?: any) => {
    onDismiss();
    navigation.navigate('Billing', params);
  };

  const handleClearChat = () => {
    setActiveOrderSession(null);
    setMessages([
      {
        id: 'msg_welcome_reset',
        sender: 'assistant',
        text: `Chat cleared. Ready for your billing and store queries!`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Helper to render bold markdown cleanly in React Native
  const renderFormattedText = (text: string, isUser: boolean) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return (
      <Text
        style={[
          styles.messageText,
          { color: isUser ? '#FFFFFF' : theme.colors.onSurface },
        ]}
      >
        {parts.map((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <Text
                key={index}
                style={{
                  fontWeight: '700',
                  color: isUser ? '#FFFFFF' : theme.colors.primary,
                }}
              >
                {part.slice(2, -2)}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[
          styles.modalContainer,
          { backgroundColor: theme.colors.surface },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              {
                backgroundColor: theme.colors.primary,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Avatar.Icon
                size={36}
                icon="robot"
                color={theme.colors.primary}
                style={{ backgroundColor: '#FFFFFF', marginRight: 10 }}
              />
              <View>
                <Text style={styles.headerTitle}>Parchiwala AI</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.headerSubtitle}>100% Offline • Private</Text>
                </View>
              </View>
            </View>
            <IconButton
              icon="broom"
              iconColor="#FFFFFF"
              size={22}
              onPress={handleClearChat}
            />
            <IconButton
              icon="close"
              iconColor="#FFFFFF"
              size={24}
              onPress={onDismiss}
            />
          </View>

          {/* Chat Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatScroll}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.messageRow,
                    isUser ? styles.messageRowUser : styles.messageRowAssistant,
                  ]}
                >
                  {!isUser && (
                    <Avatar.Icon
                      size={28}
                      icon="robot-outline"
                      color="#FFFFFF"
                      style={[
                        styles.avatarIcon,
                        { backgroundColor: theme.colors.primary },
                      ]}
                    />
                  )}
                  <View
                    style={[
                      styles.bubble,
                      isUser
                        ? [styles.userBubble, { backgroundColor: theme.colors.primary }]
                        : [
                            styles.assistantBubble,
                            {
                              backgroundColor:
                                theme.colors.elevation?.level1 || '#F4F4F6',
                              borderColor: theme.colors.outlineVariant || '#E0E0E0',
                              maxWidth: msg.cardType === 'FINAL_BILL_PREVIEW' || msg.cardType === 'DRAFT_BILL' ? '96%' : '82%',
                            },
                          ],
                    ]}
                  >
                    {renderFormattedText(msg.text, isUser)}

                    {/* Render Interactive Final Bill Summary Card */}
                    {(msg.cardType === 'FINAL_BILL_PREVIEW' || msg.cardType === 'DRAFT_BILL') && msg.cardData && (
                      <FinalBillPreviewCard
                        data={msg.cardData}
                        currency={billing.organization.currency || '₹'}
                        onPrint={() =>
                          handleActionPress({
                            id: 'act_print_now',
                            label: 'Print Bill',
                            type: 'AUTO_PRINT_PREVIEW',
                            payload: msg.cardData,
                          })
                        }
                        onOpenBuilder={() =>
                          openInvoiceBuilder({
                            prefillProduct: msg.cardData?.items?.[0],
                            prefillItems: msg.cardData?.items,
                            customerId: msg.cardData?.customer?.id,
                            paymentMethod: msg.cardData?.paymentMethod,
                            paymentStatus: msg.cardData?.paymentStatus,
                          })
                        }
                        onCancel={() =>
                          handleActionPress({
                            id: 'act_cancel',
                            label: 'Cancel Order',
                            type: 'CANCEL_ORDER',
                          })
                        }
                        isProcessing={isProcessing}
                      />
                    )}

                    <Text
                      style={[
                        styles.timestamp,
                        {
                          color: isUser
                            ? 'rgba(255,255,255,0.7)'
                            : theme.colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      {msg.timestamp}
                    </Text>

                    {/* Suggested Follow-up Chips for Assistant Message */}
                    {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                      <View style={styles.followUpsContainer}>
                        {msg.suggestedFollowUps.map((chipText, cIdx) => {
                          const isProceed =
                            chipText.toLowerCase().includes('proceed') ||
                            chipText.toLowerCase().includes('generate') ||
                            chipText.toLowerCase().includes('confirm');
                          const isAdd = chipText.toLowerCase().includes('add');
                          const isCancel = chipText.toLowerCase().includes('cancel');

                          let chipIcon = 'chevron-right';
                          if (isProceed) chipIcon = 'receipt';
                          else if (isAdd) chipIcon = 'plus-circle-outline';
                          else if (isCancel) chipIcon = 'close-circle-outline';
                          else if (chipText.includes('%') || chipText.toLowerCase().includes('discount')) chipIcon = 'percent';

                          return (
                            <Chip
                              key={`msg_${msg.id}_chip_${cIdx}`}
                              mode={isProceed ? 'flat' : 'outlined'}
                              icon={chipIcon}
                              onPress={() => handleSendMessage(chipText)}
                              style={[
                                styles.followUpChip,
                                isProceed && styles.proceedChip,
                                isAdd && styles.addProductChip,
                                isCancel && styles.cancelChip,
                              ]}
                              textStyle={[
                                styles.followUpChipText,
                                isProceed && styles.proceedChipText,
                                isAdd && styles.addProductChipText,
                                isCancel && styles.cancelChipText,
                              ]}
                            >
                              {chipText}
                            </Chip>
                          );
                        })}
                      </View>
                    )}

                    {/* Action Buttons if provided */}
                    {msg.actions && msg.actions.length > 0 && (
                      <View style={styles.actionsContainer}>
                        {msg.actions.map((act) => {
                          const isConfirm =
                            act.type === 'CONFIRM_DRAFT' ||
                            act.type === 'PROCEED_FOR_BILL' ||
                            act.type === 'AUTO_PRINT_PREVIEW';
                          const isAdd = act.type === 'ADD_PRODUCT';
                          const isCancel = act.type === 'CANCEL_ORDER';

                          return (
                            <Button
                              key={act.id}
                              mode={isConfirm ? 'contained' : isCancel ? 'text' : isAdd ? 'outlined' : 'contained-tonal'}
                              buttonColor={isConfirm ? (theme.colors.success || '#2E7D32') : isAdd ? '#E3F2FD' : undefined}
                              textColor={isConfirm ? '#FFFFFF' : isCancel ? '#D32F2F' : isAdd ? '#1565C0' : undefined}
                              icon={act.icon || (isConfirm ? 'receipt' : isCancel ? 'close-circle-outline' : 'arrow-right')}
                              onPress={() => handleActionPress(act)}
                              loading={isConfirm && isProcessing}
                              disabled={isProcessing}
                              style={[
                                styles.actionButton,
                                isAdd && { borderColor: '#90CAF9', borderWidth: 1.5 },
                              ]}
                              labelStyle={{
                                fontSize: 12.5,
                                marginVertical: 4,
                                fontWeight: isConfirm || isAdd ? 'bold' : '500',
                              }}
                            >
                              {act.label}
                            </Button>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Quick Prompts Bar */}
          <View style={styles.quickPromptsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickPromptsScroll}
            >
              {activeOrderSession ? (
                // Contextual chips for current order session
                <>
                  {activeOrderSession.items.length > 0 && (
                    <Chip
                      icon="receipt"
                      mode="flat"
                      onPress={() => handleSendMessage('Generate Bill')}
                      style={[styles.promptChip, styles.proceedChip]}
                      textStyle={[styles.proceedChipText, { fontSize: 12 }]}
                    >
                      Generate Bill ({billing.organization.currency || '₹'}{activeOrderSession.items.reduce((s, it) => s + it.price * it.quantity, 0).toFixed(2)})
                    </Chip>
                  )}
                  <Chip
                    icon="plus-circle-outline"
                    mode="outlined"
                    onPress={() => handleSendMessage('+ Add Product')}
                    style={[styles.promptChip, styles.addProductChip]}
                    textStyle={[styles.addProductChipText, { fontSize: 12 }]}
                  >
                    + Add Product
                  </Chip>
                  {billing.products
                    .filter((p) => !activeOrderSession.items.some((i) => i.productId === p.id))
                    .slice(0, 3)
                    .map((p) => (
                      <Chip
                        key={`bar_${p.id}`}
                        icon="tag-outline"
                        mode="outlined"
                        onPress={() => handleSendMessage(`1 ${p.unit || 'pcs'} ${p.name}`)}
                        style={styles.promptChip}
                        textStyle={{ fontSize: 12 }}
                      >
                        1 {p.unit || 'pcs'} {p.name}
                      </Chip>
                    ))}
                  <Chip
                    icon="close-circle-outline"
                    mode="outlined"
                    onPress={() => handleSendMessage('cancel order')}
                    style={[styles.promptChip, styles.cancelChip]}
                    textStyle={[styles.cancelChipText, { fontSize: 12 }]}
                  >
                    Cancel Order
                  </Chip>
                </>
              ) : (
                QUICK_PROMPTS.map((p) => (
                  <Chip
                    key={p.id}
                    icon={p.icon}
                    mode="outlined"
                    onPress={() => handleSendMessage(p.query)}
                    style={styles.promptChip}
                    textStyle={{ fontSize: 12 }}
                  >
                    {p.title}
                  </Chip>
                ))
              )}
            </ScrollView>
          </View>

          {/* Voice Error Banner */}
          {voiceError && !isListening && (
            <View style={styles.voiceErrorBanner}>
              <View style={styles.voiceErrorHeader}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#C62828" />
                <Text style={styles.voiceErrorText}>{voiceError}</Text>
                <TouchableOpacity onPress={() => setVoiceError(null)}>
                  <MaterialCommunityIcons name="close" size={16} color="#757575" />
                </TouchableOpacity>
              </View>
              <Button
                mode="contained-tonal"
                compact
                style={{ marginTop: 6, alignSelf: 'flex-start' }}
                buttonColor="#FFEBEE"
                textColor="#C62828"
                icon="refresh"
                onPress={handleToggleVoice}
              >
                Try Speaking Again
              </Button>
            </View>
          )}

          {/* Voice Listening Banner */}
          {isListening && (
            <View style={styles.voiceBanner}>
              <View style={styles.voiceHeader}>
                <View style={styles.recordingDot} />
                <Text style={styles.voiceHeaderText}>
                  Listening... Speak now ({selectedLocale === 'mr-IN' ? 'मराठी' : selectedLocale === 'hi-IN' ? 'हिंदी' : 'English'})
                </Text>
                <TouchableOpacity
                  onPress={() => setIsListening(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={20} color="#757575" />
                </TouchableOpacity>
              </View>

              {/* Language Switcher */}
              <View style={styles.localeRow}>
                <Text style={styles.localeLabel}>Speech Language:</Text>
                <TouchableOpacity
                  style={[
                    styles.localeChip,
                    selectedLocale === 'mr-IN' && styles.localeChipActive,
                  ]}
                  onPress={() => handleSelectLocale('mr-IN')}
                >
                  <Text
                    style={[
                      styles.localeChipText,
                      selectedLocale === 'mr-IN' && styles.localeChipTextActive,
                    ]}
                  >
                    मराठी
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.localeChip,
                    selectedLocale === 'hi-IN' && styles.localeChipActive,
                  ]}
                  onPress={() => handleSelectLocale('hi-IN')}
                >
                  <Text
                    style={[
                      styles.localeChipText,
                      selectedLocale === 'hi-IN' && styles.localeChipTextActive,
                    ]}
                  >
                    हिंदी
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.localeChip,
                    selectedLocale === 'en-IN' && styles.localeChipActive,
                  ]}
                  onPress={() => handleSelectLocale('en-IN')}
                >
                  <Text
                    style={[
                      styles.localeChipText,
                      selectedLocale === 'en-IN' && styles.localeChipTextActive,
                    ]}
                  >
                    English
                  </Text>
                </TouchableOpacity>
              </View>

              {inputQuery.trim().length > 0 && (
                <View style={styles.liveTranscriptBox}>
                  <Text style={styles.liveTranscriptLabel}>Heard so far:</Text>
                  <Text style={styles.liveTranscriptText}>"{inputQuery}"</Text>
                </View>
              )}

              <Text style={styles.voiceInstruction}>
                Say: "1 kg apple" or tap a sample below:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.voicePresetsScroll}
              >
                {VOICE_SAMPLES.map((sample, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.voiceSampleChip}
                    onPress={() => {
                      setIsListening(false);
                      handleSendMessage(sample);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="microphone-outline"
                      size={13}
                      color="#1565C0"
                      style={{ marginRight: 4 }}
                    />
                    <Text style={styles.voiceSampleText}>{sample}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <Divider />

          {/* Input Footer */}
          <View style={styles.inputBar}>
            <TextInput
              mode="outlined"
              placeholder={
                isListening
                  ? 'Listening... or type message'
                  : 'Ask or speak in Marathi / Hindi...'
              }
              value={inputQuery}
              onChangeText={setInputQuery}
              onSubmitEditing={() => handleSendMessage()}
              returnKeyType="send"
              style={styles.textInput}
              dense
              outlineStyle={{ borderRadius: 24 }}
              right={
                inputQuery.trim().length > 0 ? (
                  <TextInput.Icon
                    icon="send"
                    color={theme.colors.primary}
                    onPress={() => handleSendMessage()}
                  />
                ) : (
                  <TextInput.Icon
                    icon={isListening ? 'microphone' : 'microphone-outline'}
                    color={isListening ? '#E53935' : theme.colors.primary}
                    onPress={handleToggleVoice}
                  />
                )
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    marginHorizontal: 12,
    marginVertical: 20,
    borderRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.85,
    height: SCREEN_HEIGHT * 0.82,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '94%',
    maxWidth: 550,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 5,
  },
  chatScroll: {
    flex: 1,
    backgroundColor: '#FAFBFD',
  },
  chatContent: {
    padding: 12,
    paddingBottom: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatarIcon: {
    marginRight: 6,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  actionsContainer: {
    marginTop: 8,
    gap: 6,
  },
  actionButton: {
    borderRadius: 8,
  },
  followUpsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  followUpChip: {
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    borderColor: '#E0E0E0',
    height: 32,
  },
  followUpChipText: {
    fontSize: 11.5,
    color: '#37474F',
  },
  proceedChip: {
    backgroundColor: '#E8F5E9',
    borderColor: '#81C784',
  },
  proceedChipText: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  addProductChip: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  addProductChipText: {
    color: '#1565C0',
    fontWeight: '600',
  },
  cancelChip: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  cancelChipText: {
    color: '#C62828',
    fontWeight: '600',
  },
  quickPromptsWrapper: {
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  quickPromptsScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  promptChip: {
    borderRadius: 18,
  },
  voiceBanner: {
    backgroundColor: '#E3F2FD',
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recordingDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#E53935',
    marginRight: 6,
  },
  voiceHeaderText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0D47A1',
    flex: 1,
  },
  voiceInstruction: {
    fontSize: 11,
    color: '#546E7A',
    marginBottom: 8,
  },
  voicePresetsScroll: {
    gap: 6,
    paddingVertical: 2,
  },
  voiceSampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  voiceSampleText: {
    fontSize: 11.5,
    color: '#1565C0',
    fontWeight: '500',
  },
  voiceErrorBanner: {
    backgroundColor: '#FFEBEE',
    borderTopWidth: 1,
    borderTopColor: '#FFCDD2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  voiceErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceErrorText: {
    fontSize: 12,
    color: '#C62828',
    flex: 1,
    lineHeight: 16,
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  localeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#37474F',
  },
  localeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#B0BEC5',
  },
  localeChipActive: {
    backgroundColor: '#1E88E5',
    borderColor: '#1E88E5',
  },
  localeChipText: {
    fontSize: 11,
    color: '#455A64',
    fontWeight: '500',
  },
  localeChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  liveTranscriptBox: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    marginBottom: 6,
  },
  liveTranscriptLabel: {
    fontSize: 10,
    color: '#78909C',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  liveTranscriptText: {
    fontSize: 13,
    color: '#0D47A1',
    fontWeight: '600',
    marginTop: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  textInput: {
    flex: 1,
    fontSize: 13.5,
  },
  // Final Bill Preview Card Styles
  finalBillCard: {
    marginTop: 8,
    borderRadius: 12,
    borderColor: '#D0D7DE',
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  finalBillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
});
