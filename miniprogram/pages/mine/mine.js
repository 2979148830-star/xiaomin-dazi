const buildAvatarText = nickname => {
  const safeName = String(nickname || '').trim();
  return safeName ? safeName.slice(0, 1) : 'ME';
};

const splitHobbies = hobbies => {
  return String(hobbies || '')
    .split(/[、,，/｜|\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
};

Page({
  data: {
    myTag: '还没生成搭子画像',
    myMbti: '???',
    userInfo: {
      avatar: '',
      avatarText: 'ME',
      nickname: '',
      gender: '',
      hobbies: '',
      hobbyTags: [],
      answerTags: [],
      isProfileReady: false
    },
    publishedCount: 0,
    joinedCount: 0,
    unreadCount: 0,
    messageStatusText: '暂无未读',
    notifyStatusText: '待开启',
    joinNotifyStatusText: '待开启',
    chatNotifyStatusText: '待开启'
  },

  onLoad() {
    this.refreshPage();
  },

  onShow() {
    this.refreshPage();
  },

  refreshPage() {
    this.ensureOpenId(() => {
      this.loadMyInfo();
      this.loadMyPosts();
      this.loadMessageStatus();
    });
  },

  ensureOpenId(callback) {
    const app = getApp();
    if (app.globalData.openid) {
      callback(app.globalData.openid);
      return;
    }
    app.onOpenIdReady(callback);
  },

  buildNotifyState(record = {}) {
    const config = getApp().globalData.joinNotifyConfig || {};
    const chatConfig = getApp().globalData.chatNotifyConfig || {};
    const templateId = String(config.templateId || '').trim();
    const chatTemplateId = String(chatConfig.templateId || '').trim();
    const enabled = !!templateId &&
      !!record.join_notify_enabled &&
      String(record.join_notify_template_id || '').trim() === templateId;
    const chatEnabled = !!chatTemplateId &&
      !!record.chat_notify_enabled &&
      String(record.chat_notify_template_id || '').trim() === chatTemplateId;
    const configuredCount = (templateId ? 1 : 0) + (chatTemplateId ? 1 : 0);
    const enabledCount = (enabled ? 1 : 0) + (chatEnabled ? 1 : 0);

    return {
      notifyStatusText: !configuredCount ? '未配置' : (enabledCount ? `已开${enabledCount}项` : '待开启'),
      joinNotifyStatusText: !templateId ? '未配置' : (enabled ? '已开启' : '待开启'),
      chatNotifyStatusText: !chatTemplateId ? '未配置' : (chatEnabled ? '已开启' : '待开启')
    };
  },

  normalizeUser(record = {}) {
    const app = getApp();
    const globalUser = app.globalData.userInfo || {};
    const rawAnswerTags = record.answerTags || record.answer_tags || globalUser.answerTags || app.globalData.userAnswerTags;
    const answerTags = Array.isArray(rawAnswerTags) ? rawAnswerTags.filter(Boolean) : [];
    const nickname = record.user_name || record.nickname || globalUser.nickname || '';
    const gender = record.gender || globalUser.gender || '';
    const hobbies = record.hobbies || globalUser.hobbies || '';

    return {
      avatar: record.user_avatar || record.avatar || globalUser.avatar || '',
      avatarText: buildAvatarText(nickname),
      nickname,
      gender,
      hobbies,
      hobbyTags: splitHobbies(hobbies),
      answerTags,
      isProfileReady: !!(record.isProfileReady || record.isNicknameSet || (nickname && gender)),
      my_mbti: record.my_mbti || app.globalData.userMbti || '???',
      my_tag: record.my_tag || app.globalData.userTag || ''
    };
  },

  loadMyInfo() {
    const app = getApp();
    const db = wx.cloud.database();

    db.collection('users')
      .where({ _openid: app.globalData.openid })
      .limit(1)
      .get({
        success: res => {
          const record = res.data[0] || {};
          const userInfo = this.normalizeUser(record);
          const notifyState = this.buildNotifyState(record);

          app.saveUserInfoToGlobal(userInfo);
          this.setData({
            userInfo,
            myMbti: userInfo.my_mbti || '???',
            myTag: userInfo.my_tag || '还没生成搭子画像',
            ...notifyState
          });
        },
        fail: err => {
          console.error('获取用户信息失败:', err);
          const userInfo = this.normalizeUser();
          app.saveUserInfoToGlobal(userInfo);
          this.setData({
            userInfo,
            myMbti: userInfo.my_mbti || '???',
            myTag: userInfo.my_tag || '还没生成搭子画像',
            ...this.buildNotifyState()
          });
        }
      });
  },

  loadMyPosts() {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getMyPosts' },
      success: res => {
        if (!res.result || !res.result.success) {
          return;
        }

        this.setData({
          publishedCount: (res.result.publishedPosts || []).length,
          joinedCount: (res.result.joinedPosts || []).length
        });
      },
      fail: err => {
        console.error('加载我的帖子失败:', err);
      }
    });
  },

  loadMessageStatus() {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getNotifications' },
      success: res => {
        const result = res.result || {};
        if (!result.success) {
          return;
        }

        const unreadCount = Number(result.unreadCount || 0);
        this.setData({
          unreadCount,
          messageStatusText: unreadCount > 0 ? `${unreadCount} 条未读` : '暂无未读'
        });
      },
      fail: err => {
        console.error('加载消息提醒失败:', err);
      }
    });
  }
});
