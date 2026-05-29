Page({
  data: {
    templateId: '',
    templateConfigured: false,
    notifyEnabled: false,
    statusText: '待开启',
    statusDesc: '开启后，下一次有人加入你发布的帖子时会收到提醒。',
    statusKind: 'pending',
    chatTemplateId: '',
    chatTemplateConfigured: false,
    chatNotifyEnabled: false,
    chatStatusText: '待开启',
    chatStatusDesc: '开启后，别人给你发聊天消息时会收到提醒。',
    chatStatusKind: 'pending',
    notifications: [],
    unreadCount: 0
  },

  onLoad() {
    this.refreshStatus();
  },

  onShow() {
    this.refreshStatus();
  },

  ensureOpenId(callback) {
    const app = getApp();
    if (app.globalData.openid) {
      callback(app.globalData.openid);
      return;
    }
    app.onOpenIdReady(callback);
  },

  buildStatus(record = {}) {
    const config = getApp().globalData.joinNotifyConfig || {};
    const chatConfig = getApp().globalData.chatNotifyConfig || {};
    const templateId = String(config.templateId || '').trim();
    const chatTemplateId = String(chatConfig.templateId || '').trim();
    const templateConfigured = !!templateId;
    const chatTemplateConfigured = !!chatTemplateId;
    const notifyEnabled = templateConfigured &&
      !!record.join_notify_enabled &&
      String(record.join_notify_template_id || '').trim() === templateId;
    const chatNotifyEnabled = chatTemplateConfigured &&
      !!record.chat_notify_enabled &&
      String(record.chat_notify_template_id || '').trim() === chatTemplateId;

    let statusText = '待开启';
    let statusDesc = '开启后，下一次有人加入你发布的帖子时会收到提醒。';
    let statusKind = 'pending';
    let chatStatusText = '待开启';
    let chatStatusDesc = '开启后，别人给你发聊天消息时会收到提醒。';
    let chatStatusKind = 'pending';

    if (!templateConfigured) {
      statusText = '未配置';
      statusDesc = '管理员暂未配置提醒模板，所以现在还不能开启提醒。';
    } else if (notifyEnabled) {
      statusText = '已开启';
      statusDesc = '当前已经授权成功，下一位同学加入你的帖子时，微信会提醒你一次。';
      statusKind = 'enabled';
    }

    if (!chatTemplateConfigured) {
      chatStatusText = '未配置';
      chatStatusDesc = '聊天提醒模板 ID 还没填写，填好后这里就可以开启。';
    } else if (chatNotifyEnabled) {
      chatStatusText = '已开启';
      chatStatusDesc = '当前已经授权成功，下一条别人发给你的聊天消息会提醒你一次。';
      chatStatusKind = 'enabled';
    }

    return {
      templateId,
      templateConfigured,
      notifyEnabled,
      statusText,
      statusDesc,
      statusKind,
      chatTemplateId,
      chatTemplateConfigured,
      chatNotifyEnabled,
      chatStatusText,
      chatStatusDesc,
      chatStatusKind
    };
  },

  refreshStatus() {
    this.ensureOpenId(() => {
      const app = getApp();
      const db = wx.cloud.database();

      db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1)
        .get({
          success: res => {
            this.setData(this.buildStatus(res.data[0] || {}));
          },
          fail: err => {
            console.error('读取提醒状态失败:', err);
            this.setData(this.buildStatus());
          }
        });
    });

    this.loadNotifications();
  },

  loadNotifications() {
    this.ensureOpenId(() => {
      wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getNotifications' },
        success: res => {
          const result = res.result || {};
          if (!result.success) {
            return;
          }
          this.setData({
            notifications: result.notifications || [],
            unreadCount: result.unreadCount || 0
          });
        },
        fail: err => {
          console.error('读取站内消息失败:', err);
        }
      });
    });
  },

  openNotification(e) {
    const notice = this.data.notifications[Number(e.currentTarget.dataset.index)];
    if (!notice) return;

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'markNotificationsRead',
        ids: [notice._id]
      },
      complete: () => {
        this.loadNotifications();
      }
    });

    if (notice.type === 'chat_message' && notice.conversation_id) {
      wx.navigateTo({
        url: `/pkg-extra/chat/chat?conversationId=${notice.conversation_id}`
      });
    }
  },

  saveJoinNotifyStatus(enabled) {
    if (!this.data.templateId) {
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'saveJoinNotifyStatus',
        templateId: this.data.templateId,
        enabled
      }
    });
  },

  async requestSubscription() {
    const app = getApp();

    if (!this.data.templateConfigured) {
      wx.showToast({ title: '还没有配置模板', icon: 'none' });
      return;
    }

    app.requestJoinNotifySubscription({
      loadingTitle: '申请中...',
      successTitle: '提醒已开启',
      onAccepted: () => {
        this.setData({
          notifyEnabled: true,
          statusText: '已开启',
          statusDesc: '当前已经授权成功，下一位同学加入你的帖子时，微信会提醒你一次。',
          statusKind: 'enabled'
        });
      },
      onRejected: status => {
        wx.showToast({
          title: status === 'reject' ? '你取消了授权' : '暂未开启提醒',
          icon: 'none'
        });
      },
      onInvalidTemplate: () => {
        this.setData({
          notifyEnabled: false,
          statusText: '配置异常',
          statusDesc: '提醒模板暂时不可用，请稍后再试或联系管理员检查配置。',
          statusKind: 'error'
        });
      }
    });
  },

  async requestChatSubscription() {
    const app = getApp();

    if (!this.data.chatTemplateConfigured) {
      wx.showToast({ title: '还没有配置模板', icon: 'none' });
      return;
    }

    app.requestChatNotifySubscription({
      loadingTitle: '申请中...',
      successTitle: '聊天提醒已开启',
      onAccepted: () => {
        this.setData({
          chatNotifyEnabled: true,
          chatStatusText: '已开启',
          chatStatusDesc: '当前已经授权成功，下一条别人发给你的聊天消息会提醒你一次。',
          chatStatusKind: 'enabled'
        });
      },
      onRejected: status => {
        wx.showToast({
          title: status === 'reject' ? '你取消了授权' : '暂未开启提醒',
          icon: 'none'
        });
      },
      onInvalidTemplate: () => {
        this.setData({
          chatNotifyEnabled: false,
          chatStatusText: '配置异常',
          chatStatusDesc: '聊天提醒模板暂时不可用，请稍后再试或联系管理员检查配置。',
          chatStatusKind: 'error'
        });
      }
    });
  },

  async resetNotifyStatus() {
    const app = getApp();
    if (!this.data.templateConfigured) {
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });

    try {
      await app.saveJoinNotifyStatus(false);
      wx.hideLoading();
      this.setData({
        notifyEnabled: false,
        statusText: '待开启',
        statusDesc: '提醒状态已重置，需要时可以再重新授权一次。',
        statusKind: 'pending'
      });
      wx.showToast({ title: '已重置', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('重置提醒状态失败:', err);
      wx.showToast({ title: '重置失败，请重试', icon: 'none' });
    }
  },

  async resetChatNotifyStatus() {
    const app = getApp();
    if (!this.data.chatTemplateConfigured) {
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });

    try {
      await app.saveChatNotifyStatus(false);
      wx.hideLoading();
      this.setData({
        chatNotifyEnabled: false,
        chatStatusText: '待开启',
        chatStatusDesc: '聊天提醒状态已重置，需要时可以再重新授权一次。',
        chatStatusKind: 'pending'
      });
      wx.showToast({ title: '已重置', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('重置聊天提醒状态失败:', err);
      wx.showToast({ title: '重置失败，请重试', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.refreshStatus();
    wx.stopPullDownRefresh();
  }
});
