Page({
  data: {
    myMbti: '???',
    myTag: '还没生成搭子画像'
  },

  onLoad() {
    this.syncPersona();
  },

  onShow() {
    this.syncPersona();
  },

  syncPersona() {
    const app = getApp();
    this.setData({
      myMbti: app.globalData.userMbti || '???',
      myTag: app.globalData.userTag || '还没生成搭子画像'
    });
  },

  async resetPersonaData() {
    const app = getApp();
    const db = wx.cloud.database();
    const userRes = await db.collection('users')
      .where({ _openid: app.globalData.openid })
      .limit(1)
      .get();

    if (!userRes.data.length) {
      return;
    }

    await db.collection('users').doc(userRes.data[0]._id).update({
      data: {
        my_mbti: '???',
        my_tag: '',
        answer_tags: [],
        update_time: db.serverDate()
      }
    });
  },

  retestPersona() {
    wx.showModal({
      title: '重新测试搭子画像',
      content: '这会清空你当前的画像标签和答题记录，然后回到测试页重新开始。',
      confirmText: '重新测试',
      confirmColor: '#ff6b6b',
      success: async res => {
        if (!res.confirm) {
          return;
        }

        const app = getApp();
        app.globalData.userMbti = '???';
        app.globalData.userTag = '';
        app.globalData.userAnswerTags = [];
        app.globalData.userInfo = {
          ...app.globalData.userInfo,
          answerTags: []
        };

        wx.setStorageSync('userMbti', '???');
        wx.setStorageSync('userTag', '');
        wx.setStorageSync('userAnswerTags', []);

        try {
          if (app.globalData.openid) {
            await this.resetPersonaData();
          }
        } catch (err) {
          console.warn('清空画像数据失败:', err);
        }

        this.setData({
          myMbti: '???',
          myTag: '还没生成搭子画像'
        });

        wx.switchTab({
          url: '/pages/publish/publish',
          success: () => {
            wx.showToast({ title: '已清空，请重新测试', icon: 'none' });
          }
        });
      }
    });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pkg-extra/privacy/privacy' });
  }
});
