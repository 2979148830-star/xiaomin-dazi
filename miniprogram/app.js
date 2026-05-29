const CLOUD_ENV = '';
const JOIN_NOTIFY_CONFIG = {
  templateId: '',
  page: 'pkg-extra/detail/detail',
  dataMap: {
    activityName: 'thing1',
    eventTime: 'time2',
    joinerName: 'thing5',
    joinTime: 'time6'
  }
};
const CHAT_NOTIFY_CONFIG = {
  templateId: '',
  page: 'pkg-extra/chat/chat',
  dataMap: {
    sendTime: 'time3',
    senderName: 'thing4',
    messageContent: 'thing2',
    noticeTitle: 'thing30',
    senderSide: 'thing31'
  }
};

App({
  privacyAgreed: false,
  openidCallbacks: [],
  launchNotifyPrompting: false,
  launchNotifyCooldownUntil: 0,
  foregroundSessionId: 0,

  globalData: {
    openid: '',
    userMbti: '???',
    userTag: '',
    userAnswerTags: [],
    privacyAgreed: false,
    hasUserInfo: false,
    joinNotifyConfig: JOIN_NOTIFY_CONFIG,
    joinNotifyEnabled: false,
    joinNotifyTemplateId: String(JOIN_NOTIFY_CONFIG.templateId || '').trim(),
    chatNotifyConfig: CHAT_NOTIFY_CONFIG,
    chatNotifyEnabled: false,
    chatNotifyTemplateId: String(CHAT_NOTIFY_CONFIG.templateId || '').trim(),
    userInfo: {
      nickname: '',
      avatar: '',
      gender: '',
      hobbies: '',
      answerTags: [],
      isProfileReady: false
    }
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }

    const cloudInitOptions = { traceUser: true };
    if (CLOUD_ENV) {
      cloudInitOptions.env = CLOUD_ENV;
    }
    wx.cloud.init(cloudInitOptions);

    const privacyAgreed = !!wx.getStorageSync('privacyAgreed');
    this.privacyAgreed = privacyAgreed;
    this.globalData.privacyAgreed = privacyAgreed;
    this.globalData.userMbti = wx.getStorageSync('userMbti') || '???';
    this.globalData.userTag = wx.getStorageSync('userTag') || '';
    this.globalData.userAnswerTags = wx.getStorageSync('userAnswerTags') || [];

    if (privacyAgreed) {
      this.getOpenId();
    } else {
      this.showPrivacyGuide();
    }
  },

  onShow() {
    if (!this.privacyAgreed) {
      return;
    }

    const sessionId = ++this.foregroundSessionId;
    const showReminder = sessionId === 1;
    const loadSessionData = () => {
      this.queryUserInfo({
        showReminder,
        afterLoad: ({ profileReady }) => {
          if (profileReady) {
            this.maybeShowLaunchNotifyPrompt(sessionId);
          }
        }
      });
    };

    if (this.globalData.openid) {
      loadSessionData();
      return;
    }

    this.onOpenIdReady(loadSessionData);
  },

  showPrivacyGuide() {
    wx.showModal({
      title: '隐私保护',
      content: '小民搭子需要在你同意隐私保护指引后，才能使用微信昵称头像、发布和加入搭子。',
      confirmText: '去阅读',
      cancelText: '退出',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({ url: '/pkg-extra/privacy/privacy' });
        } else {
          wx.exitMiniProgram();
        }
      }
    });
  },

  onOpenIdReady(callback) {
    if (this.globalData.openid) {
      callback(this.globalData.openid);
      return;
    }
    this.openidCallbacks.push(callback);
  },

  resolveOpenId(openid) {
    this.globalData.openid = openid;
    const callbacks = this.openidCallbacks.splice(0);
    callbacks.forEach(callback => callback(openid));
  },

  getOpenId() {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getOpenId' },
      success: res => {
        const openid = res.result && res.result.openid;
        if (!openid) {
          console.error('获取 OpenID 失败：返回结果为空', res);
          return;
        }
        this.resolveOpenId(openid);
      },
      fail: err => {
        console.error('获取 OpenID 失败：', err);
      }
    });
  },

  getJoinNotifyTemplateId() {
    return String((this.globalData.joinNotifyConfig || {}).templateId || '').trim();
  },

  getChatNotifyTemplateId() {
    return String((this.globalData.chatNotifyConfig || {}).templateId || '').trim();
  },

  resolveJoinNotifyState(record = {}) {
    const templateId = this.getJoinNotifyTemplateId();
    const enabled = !!templateId &&
      !!record.join_notify_enabled &&
      String(record.join_notify_template_id || '').trim() === templateId;

    return {
      templateId,
      templateConfigured: !!templateId,
      enabled
    };
  },

  resolveChatNotifyState(record = {}) {
    const templateId = this.getChatNotifyTemplateId();
    const enabled = !!templateId &&
      !!record.chat_notify_enabled &&
      String(record.chat_notify_template_id || '').trim() === templateId;

    return {
      templateId,
      templateConfigured: !!templateId,
      enabled
    };
  },

  applyJoinNotifyState(state = {}) {
    this.globalData.joinNotifyTemplateId = state.templateId || this.getJoinNotifyTemplateId();
    this.globalData.joinNotifyEnabled = !!state.enabled;
  },

  applyChatNotifyState(state = {}) {
    this.globalData.chatNotifyTemplateId = state.templateId || this.getChatNotifyTemplateId();
    this.globalData.chatNotifyEnabled = !!state.enabled;
  },

  isInvalidJoinNotifyTemplateError(err = {}) {
    const message = String(err.errMsg || '');
    return Number(err.errCode) === 20001 ||
      message.includes('No template data return') ||
      message.includes('verify the template id exist');
  },

  saveJoinNotifyStatus(enabled) {
    const templateId = this.getJoinNotifyTemplateId();
    if (!this.globalData.openid || !templateId) {
      this.applyJoinNotifyState({
        templateId,
        enabled: false
      });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'saveJoinNotifyStatus',
        templateId,
        enabled
      }
    }).then(() => {
      this.applyJoinNotifyState({
        templateId,
        enabled
      });
    }).catch(err => {
      console.warn('同步订阅消息状态失败:', err);
      throw err;
    });
  },

  saveChatNotifyStatus(enabled) {
    const templateId = this.getChatNotifyTemplateId();
    if (!this.globalData.openid || !templateId) {
      this.applyChatNotifyState({
        templateId,
        enabled: false
      });
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'saveChatNotifyStatus',
        templateId,
        enabled
      }
    }).then(() => {
      this.applyChatNotifyState({
        templateId,
        enabled
      });
    }).catch(err => {
      console.warn('同步聊天订阅消息状态失败:', err);
      throw err;
    });
  },

  requestJoinNotifySubscription(options = {}) {
    const {
      loadingTitle = '申请提醒权限...',
      successTitle = '已开启提醒',
      invalidTemplateTitle = '提醒暂不可用',
      invalidTemplateContent = '当前订阅消息模板还没有生效或模板 ID 有误，请稍后再试。',
      failureTitle = '订阅消息申请失败',
      showLoading = true,
      showSuccessToast = true,
      showFailureToast = true,
      onAccepted,
      onRejected,
      onInvalidTemplate,
      onError,
      onComplete
    } = options;

    const templateId = this.getJoinNotifyTemplateId();
    if (!templateId) {
      wx.showToast({ title: '订阅模板未配置', icon: 'none' });
      onError && onError({ code: 'NO_TEMPLATE_ID' });
      onComplete && onComplete();
      return;
    }

    if (typeof wx.requestSubscribeMessage !== 'function') {
      wx.showToast({ title: '当前基础库不支持订阅消息', icon: 'none' });
      onError && onError({ code: 'UNSUPPORTED' });
      onComplete && onComplete();
      return;
    }

    if (showLoading) {
      wx.showLoading({ title: loadingTitle, mask: true });
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: res => {
        const status = res[templateId];

        if (status === 'accept') {
          this.saveJoinNotifyStatus(true)
            .then(() => {
              if (showLoading) {
                wx.hideLoading();
              }
              if (showSuccessToast) {
                wx.showToast({ title: successTitle, icon: 'success' });
              }
              onAccepted && onAccepted();
              onComplete && onComplete();
            })
            .catch(err => {
              if (showLoading) {
                wx.hideLoading();
              }
              onError && onError(err);
              if (showFailureToast) {
                wx.showToast({ title: '开启失败，请重试', icon: 'none' });
              }
              onComplete && onComplete();
            });
          return;
        }

        if (showLoading) {
          wx.hideLoading();
        }
        onRejected && onRejected(status);
        onComplete && onComplete();
      },
      fail: err => {
        if (showLoading) {
          wx.hideLoading();
        }

        if (this.isInvalidJoinNotifyTemplateError(err)) {
          this.applyJoinNotifyState({
            templateId,
            enabled: false
          });
          onInvalidTemplate && onInvalidTemplate(err);
          wx.showModal({
            title: invalidTemplateTitle,
            content: invalidTemplateContent,
            showCancel: false
          });
          onComplete && onComplete();
          return;
        }

        onError && onError(err);
        if (showFailureToast) {
          wx.showToast({ title: failureTitle, icon: 'none' });
        }
        onComplete && onComplete();
      }
    });
  },

  requestChatNotifySubscription(options = {}) {
    const {
      loadingTitle = '申请聊天提醒...',
      successTitle = '聊天提醒已开启',
      invalidTemplateTitle = '聊天提醒暂不可用',
      invalidTemplateContent = '当前聊天订阅消息模板还没有生效或模板 ID 有误，请稍后再试。',
      failureTitle = '聊天提醒申请失败',
      showLoading = true,
      showSuccessToast = true,
      showFailureToast = true,
      onAccepted,
      onRejected,
      onInvalidTemplate,
      onError,
      onComplete
    } = options;

    const templateId = this.getChatNotifyTemplateId();
    if (!templateId) {
      wx.showToast({ title: '聊天模板未配置', icon: 'none' });
      onError && onError({ code: 'NO_TEMPLATE_ID' });
      onComplete && onComplete();
      return;
    }

    if (typeof wx.requestSubscribeMessage !== 'function') {
      wx.showToast({ title: '当前基础库不支持订阅消息', icon: 'none' });
      onError && onError({ code: 'UNSUPPORTED' });
      onComplete && onComplete();
      return;
    }

    if (showLoading) {
      wx.showLoading({ title: loadingTitle, mask: true });
    }

    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: res => {
        const status = res[templateId];

        if (status === 'accept') {
          this.saveChatNotifyStatus(true)
            .then(() => {
              if (showLoading) {
                wx.hideLoading();
              }
              if (showSuccessToast) {
                wx.showToast({ title: successTitle, icon: 'success' });
              }
              onAccepted && onAccepted();
              onComplete && onComplete();
            })
            .catch(err => {
              if (showLoading) {
                wx.hideLoading();
              }
              onError && onError(err);
              if (showFailureToast) {
                wx.showToast({ title: '开启失败，请重试', icon: 'none' });
              }
              onComplete && onComplete();
            });
          return;
        }

        if (showLoading) {
          wx.hideLoading();
        }
        onRejected && onRejected(status);
        onComplete && onComplete();
      },
      fail: err => {
        if (showLoading) {
          wx.hideLoading();
        }

        if (this.isInvalidJoinNotifyTemplateError(err)) {
          this.applyChatNotifyState({
            templateId,
            enabled: false
          });
          onInvalidTemplate && onInvalidTemplate(err);
          wx.showModal({
            title: invalidTemplateTitle,
            content: invalidTemplateContent,
            showCancel: false
          });
          onComplete && onComplete();
          return;
        }

        onError && onError(err);
        if (showFailureToast) {
          wx.showToast({ title: failureTitle, icon: 'none' });
        }
        onComplete && onComplete();
      }
    });
  },

  maybeShowLaunchNotifyPrompt(sessionId) {
    const templateId = this.getJoinNotifyTemplateId();
    const currentPage = getCurrentPages().slice(-1)[0];
    const currentRoute = currentPage ? currentPage.route : '';

    if (!templateId ||
      !this.globalData.hasUserInfo ||
      this.globalData.joinNotifyEnabled ||
      this.launchNotifyPrompting ||
      Date.now() < this.launchNotifyCooldownUntil ||
      currentRoute === 'pkg-extra/privacy/privacy') {
      return;
    }

    this.launchNotifyPrompting = true;

    setTimeout(() => {
      wx.showModal({
        title: '开启加入提醒',
        content: '为了不错过新同学加入你的帖子，建议现在开启一次微信提醒。',
        confirmText: '去开启',
        cancelText: '稍后',
        success: res => {
          this.launchNotifyPrompting = false;
          this.launchNotifyCooldownUntil = Date.now() + 1500;

          if (!res.confirm || sessionId !== this.foregroundSessionId) {
            return;
          }

          this.launchNotifyCooldownUntil = Date.now() + 5000;
          this.requestJoinNotifySubscription({
            loadingTitle: '开启提醒中...',
            successTitle: '提醒已开启',
            invalidTemplateContent: '当前订阅消息模板还没有生效或模板 ID 仍有问题，请稍后再试。',
            onAccepted: () => {
              this.applyJoinNotifyState({
                templateId,
                enabled: true
              });
            },
            onRejected: () => {
              this.applyJoinNotifyState({
                templateId,
                enabled: false
              });
            }
          });
        },
        fail: () => {
          this.launchNotifyPrompting = false;
        }
      });
    }, 360);
  },

  normalizeUserInfo(userInfo = {}) {
    const nickname = userInfo.nickname || userInfo.user_name || '';
    const avatar = userInfo.avatar || userInfo.user_avatar || '';
    const gender = userInfo.gender || '';
    const hobbies = userInfo.hobbies || '';
    const answerTags = Array.isArray(userInfo.answerTags || userInfo.answer_tags)
      ? (userInfo.answerTags || userInfo.answer_tags).filter(Boolean)
      : [];
    const isProfileReady = !!(userInfo.isProfileReady || userInfo.isNicknameSet || (nickname && gender));

    return {
      _id: userInfo._id || '',
      nickname,
      avatar,
      gender,
      hobbies,
      answerTags,
      isProfileReady
    };
  },

  queryUserInfo(options = {}) {
    const { showReminder = false, afterLoad } = options;
    if (!this.globalData.openid) return;

    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: this.globalData.openid
    }).get({
      success: res => {
        if (res.data.length > 0) {
          const record = res.data[0];
          const userInfo = this.normalizeUserInfo(record);
          const notifyState = this.resolveJoinNotifyState(record);
          const chatNotifyState = this.resolveChatNotifyState(record);
          this.globalData.userInfo = userInfo;
          this.globalData.hasUserInfo = userInfo.isProfileReady;
          this.globalData.userMbti = record.my_mbti || this.globalData.userMbti || '???';
          this.globalData.userTag = record.my_tag || this.globalData.userTag || '';
          this.globalData.userAnswerTags = Array.isArray(record.answer_tags) ? record.answer_tags.filter(Boolean) : [];
          this.applyJoinNotifyState(notifyState);
          this.applyChatNotifyState(chatNotifyState);

          wx.setStorageSync('userMbti', this.globalData.userMbti);
          wx.setStorageSync('userTag', this.globalData.userTag);
          wx.setStorageSync('userAnswerTags', this.globalData.userAnswerTags);

          afterLoad && afterLoad({
            hasRecord: true,
            profileReady: userInfo.isProfileReady,
            notifyEnabled: notifyState.enabled,
            chatNotifyEnabled: chatNotifyState.enabled
          });
        } else {
          this.globalData.hasUserInfo = false;
          this.globalData.userInfo = this.normalizeUserInfo();
          this.applyJoinNotifyState(this.resolveJoinNotifyState());
          this.applyChatNotifyState(this.resolveChatNotifyState());

          if (showReminder) {
            setTimeout(() => this.showProfileReminder(), 600);
          }

          afterLoad && afterLoad({
            hasRecord: false,
            profileReady: false,
            notifyEnabled: false,
            chatNotifyEnabled: false
          });
        }
      },
      fail: err => {
        console.error('查询用户信息失败:', err);
        this.globalData.hasUserInfo = false;
        this.applyJoinNotifyState(this.resolveJoinNotifyState());
        this.applyChatNotifyState(this.resolveChatNotifyState());
        afterLoad && afterLoad({
          hasRecord: false,
          profileReady: false,
          notifyEnabled: false,
          chatNotifyEnabled: false,
          error: err
        });
      }
    });
  },

  showProfileReminder() {
    wx.showModal({
      title: '欢迎来到小民搭子',
      content: '请先在“我的”页面确认微信头像、昵称和性别，之后就可以发布或加入中央民族大学的搭子啦。',
      confirmText: '去完善',
      confirmColor: '#667eea',
      success: res => {
        if (res.confirm) {
          wx.switchTab({ url: '/pages/mine/mine' });
        }
      }
    });
  },

  checkPrivacyAgreement() {
    const agreed = !!wx.getStorageSync('privacyAgreed');
    this.privacyAgreed = agreed;
    this.globalData.privacyAgreed = agreed;

    if (!agreed) {
      this.showPrivacyGuide();
      return false;
    }
    return true;
  },

  saveMbtiTest(mbtiResult, tag, answerTags = []) {
    this.globalData.userMbti = mbtiResult;
    this.globalData.userTag = tag;
    this.globalData.userAnswerTags = Array.isArray(answerTags) ? answerTags.filter(Boolean) : [];
    wx.setStorageSync('userMbti', mbtiResult);
    wx.setStorageSync('userTag', tag);
    wx.setStorageSync('userAnswerTags', this.globalData.userAnswerTags);

    this.globalData.userInfo = {
      ...this.globalData.userInfo,
      answerTags: this.globalData.userAnswerTags
    };

    if (this.globalData.openid) {
      const db = wx.cloud.database();
      db.collection('users').where({ _openid: this.globalData.openid }).update({
        data: {
          my_mbti: mbtiResult,
          my_tag: tag,
          answer_tags: this.globalData.userAnswerTags,
          update_time: db.serverDate()
        }
      }).catch(err => {
        console.warn('同步 MBTI 到用户档案失败:', err);
      });
    }
  },

  saveUserInfoToGlobal(userInfo) {
    const normalized = this.normalizeUserInfo(userInfo);
    this.globalData.userInfo = normalized;
    this.globalData.hasUserInfo = normalized.isProfileReady;
    this.globalData.userAnswerTags = normalized.answerTags || [];
  }
});
