const POLL_INTERVAL_MS = 4000;

const buildAvatarText = name => {
  const safeName = String(name || '').trim();
  return safeName ? safeName.slice(0, 1) : '同';
};

Page({
  data: {
    loading: true,
    sending: false,
    conversation: null,
    messages: [],
    inputText: '',
    lastMessageViewId: ''
  },

  onLoad(options = {}) {
    this.conversationId = options.conversationId || '';
    this.postId = options.postId || '';
    this.peerOpenid = options.peerOpenid || '';
    this.initChat();
  },

  onUnload() {
    this.stopPolling();
  },

  onPullDownRefresh() {
    this.loadMessages(false).finally(() => wx.stopPullDownRefresh());
  },

  initChat() {
    if (this.conversationId) {
      this.setData({
        conversation: { _id: this.conversationId },
        loading: false
      }, () => {
        this.loadMessages(false);
        this.startPolling();
      });
      return;
    }

    if (!this.postId) {
      wx.showToast({ title: '缺少帖子信息', icon: 'none' });
      this.setData({ loading: false });
      return;
    }

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'getOrCreateChat',
        postId: this.postId,
        peerOpenid: this.peerOpenid
      },
      success: res => {
        const result = res.result || {};
        if (!result.success) {
          wx.showToast({ title: result.message || '聊天打开失败', icon: 'none' });
          this.setData({ loading: false });
          return;
        }

        this.setData({
          conversation: result.conversation,
          loading: false
        }, () => {
          this.loadMessages(false);
          this.startPolling();
        });
      },
      fail: err => {
        console.error('打开聊天失败:', err);
        wx.showToast({ title: '聊天打开失败', icon: 'none' });
        this.setData({ loading: false });
      }
    });
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.loadMessages(false);
    }, POLL_INTERVAL_MS);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  normalizeMessages(messages = []) {
    return messages.map((item, index) => {
      const senderName = item.sender_display_name || item.sender_name || (item.isMine ? '我' : '同学');
      return {
        ...item,
        sender_display_name: senderName,
        avatarText: buildAvatarText(senderName),
        viewId: `msg-${index}`
      };
    });
  },

  loadMessages(showLoading = true) {
    const conversationId = this.data.conversation && this.data.conversation._id;
    if (!conversationId) {
      return Promise.resolve();
    }

    if (showLoading) {
      this.setData({ loading: true });
    }

    return wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'getChatMessages',
        conversationId
      }
    }).then(res => {
      const result = res.result || {};
      if (!result.success) {
        wx.showToast({ title: result.message || '消息加载失败', icon: 'none' });
        return;
      }

      const messages = this.normalizeMessages(result.messages || []);
      this.setData({
        conversation: result.conversation,
        messages,
        lastMessageViewId: messages.length ? messages[messages.length - 1].viewId : '',
        loading: false
      });
    }).catch(err => {
      console.error('加载聊天消息失败:', err);
      this.setData({ loading: false });
    });
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  sendMessage() {
    const conversationId = this.data.conversation && this.data.conversation._id;
    const content = String(this.data.inputText || '').trim();

    if (!conversationId || this.data.sending) {
      return;
    }
    if (!content) {
      wx.showToast({ title: '先写点内容吧', icon: 'none' });
      return;
    }

    this.setData({ sending: true });
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'sendChatMessage',
        conversationId,
        content,
        chatNotifyConfig: (getApp().globalData || {}).chatNotifyConfig || {}
      },
      success: res => {
        const result = res.result || {};
        if (!result.success) {
          wx.showToast({ title: result.message || '发送失败', icon: 'none' });
          return;
        }

        const messages = this.normalizeMessages([...this.data.messages, result.message]);
        this.setData({
          inputText: '',
          messages,
          lastMessageViewId: messages[messages.length - 1].viewId
        });
      },
      fail: err => {
        console.error('发送聊天消息失败:', err);
        wx.showToast({ title: '发送失败，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ sending: false });
      }
    });
  }
});
