const DEFAULT_FORM = () => ({
  content: '',
  contact: ''
});

Page({
  data: {
    typeOptions: ['体验问题', '发布/加入', '资料与账号', '功能建议', '其他'],
    typeIndex: 0,
    form: DEFAULT_FORM(),
    contentLength: 0,
    submitting: false
  },

  onTypeChange(e) {
    this.setData({
      typeIndex: Number(e.detail.value) || 0
    });
  },

  onContentInput(e) {
    const content = String(e.detail.value || '').replace(/^\s+/, '');
    this.setData({
      'form.content': content,
      contentLength: content.length
    });
  },

  onContactInput(e) {
    this.setData({
      'form.contact': String(e.detail.value || '').trim()
    });
  },

  validateFeedback() {
    const content = String(this.data.form.content || '').trim();
    if (content.length < 5) {
      wx.showToast({ title: '请多写一点问题细节', icon: 'none' });
      return false;
    }
    return true;
  },

  buildFeedbackPayload() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    let systemInfo = {};

    try {
      systemInfo = wx.getSystemInfoSync();
    } catch (err) {
      console.warn('读取系统信息失败:', err);
    }

    return {
      category: this.data.typeOptions[this.data.typeIndex] || '其他',
      content: String(this.data.form.content || '').trim(),
      contact: String(this.data.form.contact || '').trim(),
      page: 'mine-feedback',
      user: {
        nickname: userInfo.nickname || '',
        gender: userInfo.gender || '',
        mbti: app.globalData.userMbti || '',
        tag: app.globalData.userTag || ''
      },
      system: {
        model: systemInfo.model || '',
        system: systemInfo.system || '',
        platform: systemInfo.platform || '',
        version: systemInfo.version || '',
        SDKVersion: systemInfo.SDKVersion || ''
      }
    };
  },

  submitFeedback() {
    if (this.data.submitting || !this.validateFeedback()) {
      return;
    }

    const app = getApp();
    if (!app.globalData.openid) {
      wx.showToast({ title: '正在登录，请稍后再试', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'submitFeedback',
        feedback: this.buildFeedbackPayload()
      },
      success: res => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          wx.showToast({
            title: (res.result && res.result.message) || '提交失败，请稍后重试',
            icon: 'none'
          });
          return;
        }

        this.setData({
          form: DEFAULT_FORM(),
          contentLength: 0,
          typeIndex: 0
        });
        wx.showToast({ title: '反馈已收到', icon: 'success' });
      },
      fail: err => {
        wx.hideLoading();
        console.error('提交反馈失败:', err);
        wx.showToast({ title: '提交失败，请检查网络', icon: 'none' });
      },
      complete: () => {
        this.setData({ submitting: false });
      }
    });
  }
});
