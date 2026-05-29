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
    form: {
      avatar: '',
      avatarText: 'ME',
      nickname: '',
      gender: '',
      hobbies: '',
      answerTags: []
    },
    genderOptions: ['男生', '女生', '保密'],
    genderIndex: -1,
    myMbti: '???',
    myTag: '还没生成搭子画像',
    hobbyTags: [],
    profileReady: false,
    saving: false,
    avatarChanged: false,
    avatarFilePath: ''
  },

  onLoad() {
    this.refreshProfile();
  },

  onShow() {
    this.refreshProfile();
  },

  refreshProfile() {
    this.ensureOpenId(() => {
      this.loadProfile();
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

  buildBaseUser(record = {}) {
    const app = getApp();
    const globalUser = app.globalData.userInfo || {};
    const rawAnswerTags = record.answerTags || record.answer_tags || globalUser.answerTags || app.globalData.userAnswerTags;
    const answerTags = Array.isArray(rawAnswerTags) ? rawAnswerTags.filter(Boolean) : [];
    const nickname = record.user_name || record.nickname || globalUser.nickname || '';
    const gender = record.gender || globalUser.gender || '';

    return {
      avatar: record.user_avatar || record.avatar || globalUser.avatar || '',
      avatarText: buildAvatarText(nickname),
      nickname,
      gender,
      hobbies: record.hobbies || globalUser.hobbies || '',
      answerTags,
      isProfileReady: !!(record.isProfileReady || record.isNicknameSet || (nickname && gender))
    };
  },

  loadProfile() {
    const app = getApp();
    const db = wx.cloud.database();

    db.collection('users')
      .where({ _openid: app.globalData.openid })
      .limit(1)
      .get({
        success: res => {
          const record = res.data[0] || {};
          const userInfo = this.buildBaseUser(record);
          this.recordId = record._id || '';
          app.saveUserInfoToGlobal(userInfo);

          this.setData({
            form: {
              avatar: userInfo.avatar,
              avatarText: userInfo.avatarText,
              nickname: userInfo.nickname,
              gender: userInfo.gender,
              hobbies: userInfo.hobbies,
              answerTags: userInfo.answerTags
            },
            genderIndex: this.data.genderOptions.indexOf(userInfo.gender),
            myMbti: record.my_mbti || app.globalData.userMbti || '???',
            myTag: record.my_tag || app.globalData.userTag || '还没生成搭子画像',
            hobbyTags: splitHobbies(userInfo.hobbies),
            profileReady: userInfo.isProfileReady,
            avatarChanged: false,
            avatarFilePath: ''
          });
        },
        fail: err => {
          console.error('读取个人信息失败:', err);
          const userInfo = this.buildBaseUser();
          app.saveUserInfoToGlobal(userInfo);

          this.setData({
            form: {
              avatar: userInfo.avatar,
              avatarText: userInfo.avatarText,
              nickname: userInfo.nickname,
              gender: userInfo.gender,
              hobbies: userInfo.hobbies,
              answerTags: userInfo.answerTags
            },
            genderIndex: this.data.genderOptions.indexOf(userInfo.gender),
            myMbti: app.globalData.userMbti || '???',
            myTag: app.globalData.userTag || '还没生成搭子画像',
            hobbyTags: splitHobbies(userInfo.hobbies),
            profileReady: userInfo.isProfileReady,
            avatarChanged: false,
            avatarFilePath: ''
          });
        }
      });
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    if (!avatarUrl) {
      return;
    }

    this.setData({
      'form.avatar': avatarUrl,
      avatarChanged: true,
      avatarFilePath: avatarUrl
    });
  },

  onNicknameInput(e) {
    const nickname = String(e.detail.value || '').trim();
    this.setData({
      'form.nickname': nickname,
      'form.avatarText': buildAvatarText(nickname)
    });
  },

  onGenderChange(e) {
    const genderIndex = Number(e.detail.value);
    this.setData({
      genderIndex,
      'form.gender': this.data.genderOptions[genderIndex] || ''
    });
  },

  onHobbiesInput(e) {
    const hobbies = String(e.detail.value || '').trim();
    this.setData({
      'form.hobbies': hobbies,
      hobbyTags: splitHobbies(hobbies)
    });
  },

  validateProfile() {
    if (!this.data.form.nickname) {
      wx.showToast({ title: '请先设置昵称', icon: 'none' });
      return false;
    }

    if (!this.data.form.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return false;
    }

    return true;
  },

  async uploadAvatarIfNeeded() {
    if (!this.data.avatarChanged || !this.data.avatarFilePath) {
      return this.data.form.avatar || '';
    }

    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `avatars/${getApp().globalData.openid}_${Date.now()}.png`,
      filePath: this.data.avatarFilePath
    });

    return uploadRes.fileID;
  },

  async ensureNicknameAvailable() {
    const nickname = this.data.form.nickname;
    const res = await wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'checkNickname',
        nickname
      }
    });
    const result = res.result || {};

    if (!result.success) {
      throw new Error(result.message || '昵称检查失败');
    }

    if (!result.available) {
      wx.showToast({ title: result.message || '这个昵称已被校友使用', icon: 'none' });
      return false;
    }

    return true;
  },

  async saveProfile() {
    if (this.data.saving || !this.validateProfile()) {
      return;
    }

    const app = getApp();
    const db = wx.cloud.database();
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      const nicknameAvailable = await this.ensureNicknameAvailable();
      if (!nicknameAvailable) {
        wx.hideLoading();
        this.setData({ saving: false });
        return;
      }

      const avatar = await this.uploadAvatarIfNeeded();
      const answerTags = Array.isArray((app.globalData.userInfo || {}).answerTags)
        ? (app.globalData.userInfo || {}).answerTags
        : (app.globalData.userAnswerTags || []);
      const profileData = {
        user_name: this.data.form.nickname,
        user_avatar: avatar,
        gender: this.data.form.gender,
        hobbies: this.data.form.hobbies,
        answer_tags: answerTags,
        my_mbti: app.globalData.userMbti || '???',
        my_tag: app.globalData.userTag || '',
        isProfileReady: true,
        update_time: db.serverDate()
      };

      const userRes = await db.collection('users')
        .where({ _openid: app.globalData.openid })
        .limit(1)
        .get();

      if (userRes.data.length > 0) {
        this.recordId = userRes.data[0]._id;
        await db.collection('users').doc(this.recordId).update({
          data: profileData
        });
      } else {
        await db.collection('users').add({
          data: {
            ...profileData,
            create_time: db.serverDate()
          }
        });
      }

      const userInfo = {
        avatar,
        nickname: this.data.form.nickname,
        gender: this.data.form.gender,
        hobbies: this.data.form.hobbies,
        answerTags,
        isProfileReady: true
      };

      app.saveUserInfoToGlobal(userInfo);
      wx.hideLoading();
      this.setData({
        form: {
          avatar,
          avatarText: buildAvatarText(userInfo.nickname),
          nickname: userInfo.nickname,
          gender: userInfo.gender,
          hobbies: userInfo.hobbies,
          answerTags
        },
        hobbyTags: splitHobbies(userInfo.hobbies),
        profileReady: true,
        saving: false,
        avatarChanged: false,
        avatarFilePath: ''
      });
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      console.error('保存个人信息失败:', err);
      wx.showToast({ title: err.message || '保存失败，请重试', icon: 'none' });
    }
  },

  goSettings() {
    wx.navigateTo({ url: '/pkg-mine/settings/settings' });
  }
});
