const app = getApp();

const buildAvatarText = nickname => {
  const safeName = String(nickname || '').trim();
  return safeName ? safeName.slice(0, 1) : 'U';
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
    postDetail: null,
    canSeePhone: false,
    isJoined: false,
    isCreator: false,
    isFull: false,
    creatorNotifyEnabled: false,
    joinButtonText: '我要上车'
  },

  onLoad(options) {
    const id = options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }

    this.postId = id;
    if (app.globalData.openid) {
      this.fetchDetail(id);
    } else {
      app.onOpenIdReady(() => this.fetchDetail(id));
    }
  },

  fetchDetail(id) {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'getPostDetail',
        postId: id,
        joinNotifyConfig: app.globalData.joinNotifyConfig || {}
      },
      success: (res) => {
        if (!res.result || !res.result.success) {
          wx.showToast({ title: '帖子不存在', icon: 'none' });
          return;
        }

        const post = res.result.post;
        const isFull = post.status === 'full' || Number(post.total_people) <= 0;
        const isCreator = !!res.result.isCreator;
        const isJoined = !!res.result.isJoined;
        const canSeePhone = isCreator || isJoined || !!res.result.canSeePhone;
        const joinedUsers = Array.isArray(post.joined_users)
          ? post.joined_users.map((user, index) => ({
            ...user,
            id: user.openid || `${post._id}-${index}`,
            avatar: user.avatar || '',
            avatarText: buildAvatarText(user.nickname),
            nickname: user.nickname || '已加入同学'
          }))
          : [];
        const joinButtonText = isCreator ? '我发布的搭子' : (isJoined ? '已加入' : (isFull ? '已满员' : '立刻加入'));
        this.setData({
          postDetail: {
            ...post,
            statusText: isFull ? '已满员' : '招募中',
            remainText: isFull ? '已满员' : `还缺 ${post.total_people || 0} 人`,
            creatorHobbyTags: splitHobbies(post.creator_hobbies),
            joined_users: joinedUsers
          },
          canSeePhone,
          isJoined,
          isCreator,
          isFull,
          creatorNotifyEnabled: !!res.result.creatorNotifyEnabled,
          joinButtonText
        }, () => {
          if (isCreator && !res.result.creatorNotifyEnabled) {
            this.showCreatorNotifyGuide();
          }
        });
      },
      fail: (err) => {
        console.error('获取详情失败', err);
        wx.showToast({ title: '帖子加载失败', icon: 'none' });
      }
    });
  },

  callCreator() {
    if (!this.data.canSeePhone) {
      wx.showToast({ title: '加入后才能拨打电话', icon: 'none' });
      return;
    }

    const phone = this.data.postDetail && this.data.postDetail.phone;
    if (!phone) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }

    wx.makePhoneCall({
      phoneNumber: phone,
      fail: () => {}
    });
  },

  openCreatorChat() {
    const post = this.data.postDetail;
    if (!post || !this.data.isJoined) {
      wx.showToast({ title: '加入后才能聊天', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pkg-extra/chat/chat?postId=${post._id}`
    });
  },

  openJoinerChat(e) {
    if (!this.data.isCreator || !this.data.postDetail) {
      return;
    }

    const peerOpenid = e.currentTarget.dataset.openid;
    if (!peerOpenid) {
      wx.showToast({ title: '缺少同学信息', icon: 'none' });
      return;
    }

    wx.navigateTo({
      url: `/pkg-extra/chat/chat?postId=${this.data.postDetail._id}&peerOpenid=${peerOpenid}`
    });
  },

  onJoinTap() {
    if (!this.data.postDetail) return;

    if (this.data.isCreator) {
      wx.showToast({ title: '这是你发布的搭子', icon: 'none' });
      return;
    }

    if (this.data.isJoined) {
      wx.showToast({ title: '你已经上车了', icon: 'none' });
      return;
    }

    if (this.data.isFull) {
      wx.showToast({ title: '这个搭子已满员', icon: 'none' });
      return;
    }

    if (!app.globalData.hasUserInfo || !app.globalData.userInfo.gender) {
      wx.showModal({
        title: '请先完善资料',
        content: '上车前需要先在“我的”页面确认微信昵称、头像和性别。',
        confirmText: '去完善',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/mine/mine' });
          }
        }
      });
      return;
    }

    if (!this.data.creatorNotifyEnabled && !this.creatorNotifyMissingConfirmed) {
      wx.showModal({
        title: '提醒可能不会推送',
        content: '发起者还没有开启“新人加入提醒”，你仍然可以上车。成功后建议主动拨打电话联系一下。',
        confirmText: '继续上车',
        cancelText: '先等等',
        success: (res) => {
          if (res.confirm) {
            this.creatorNotifyMissingConfirmed = true;
            this.onJoinTap();
          }
        }
      });
      return;
    }

    wx.showLoading({ title: '正在上车...', mask: true });
    const joinNotifyConfig = app.globalData.joinNotifyConfig || {};

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'joinPost',
        postId: this.data.postDetail._id,
        userProfile: app.globalData.userInfo,
        joinNotifyConfig
      },
      success: (res) => {
        wx.hideLoading();
        const result = res.result || {};

        if (!result.success) {
          wx.showToast({ title: result.message || '上车失败', icon: 'none' });
          this.fetchDetail(this.data.postDetail._id);
          return;
        }

        const notifyHint = this.data.creatorNotifyEnabled
          ? ''
          : '\n\n发起者暂未开启微信提醒，建议你主动联系一下。';
        wx.showModal({
          title: result.code === 'ALREADY_JOINED' ? '你已上车' : '上车成功',
          content: result.phone ? `联系电话：${result.phone}${notifyHint}` : `已加入该搭子，详情页会展示联系方式。${notifyHint}`,
          confirmText: '知道了',
          showCancel: false,
          success: () => {
            this.fetchDetail(this.data.postDetail._id);
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('上车失败详情：', err);
        wx.showToast({ title: '操作失败，请重试', icon: 'none' });
      }
    });
  },

  showCreatorNotifyGuide() {
    const templateId = String((app.globalData.joinNotifyConfig || {}).templateId || '').trim();
    if (!templateId || this.creatorNotifyGuideShown) {
      return;
    }

    this.creatorNotifyGuideShown = true;
    wx.showModal({
      title: '开启加入提醒',
      content: '有人加入你的帖子时，微信提醒需要你先授权一次。开启后，下一位同学上车时就会收到提醒。',
      confirmText: '去开启',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          this.requestJoinNotifySubscription();
        }
      }
    });
  },

  saveJoinNotifyStatus(enabled) {
    const templateId = String((app.globalData.joinNotifyConfig || {}).templateId || '').trim();
    if (!templateId) {
      return Promise.resolve();
    }

    return wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'saveJoinNotifyStatus',
        templateId,
        enabled
      }
    }).catch(err => {
      console.warn('同步订阅消息授权状态失败:', err);
    });
  },

  async requestJoinNotifySubscription() {
    if (!app.getJoinNotifyTemplateId()) {
      wx.showToast({ title: '订阅模板未配置', icon: 'none' });
      return;
    }

    app.requestJoinNotifySubscription({
      loadingTitle: '申请提醒权限...',
      successTitle: '已开启提醒',
      onAccepted: () => {
        this.setData({ creatorNotifyEnabled: true });
      },
      onRejected: status => {
        wx.showToast({ title: status === 'reject' ? '你取消了授权' : '暂未开启提醒', icon: 'none' });
      },
      invalidTemplateContent: '当前订阅消息模板还没有生效或模板 ID 有误，请稍后再试。'
    });
  },

  buildPostDraft(mode = 'copy') {
    const post = this.data.postDetail || {};
    const isOther = post.category === '其他';

    return {
      mode,
      postId: mode === 'edit' ? post._id : '',
      formData: {
        type: isOther ? '其他' : (post.category || post.type || ''),
        customType: isOther ? (post.custom_type || post.type || '') : '',
        date: post.date || '',
        time: post.time || '',
        location: post.location || '',
        total_people: Number(post.total_people || 1),
        note: post.note || '',
        gender: post.gender || '',
        phone: post.phone || ''
      }
    };
  },

  openDraft(mode) {
    wx.setStorageSync('postDraft', this.buildPostDraft(mode));
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  onCopyPostTap() {
    this.openDraft('copy');
  },

  onEditPostTap() {
    if (!this.data.isCreator) {
      wx.showToast({ title: '只能编辑自己发布的帖子', icon: 'none' });
      return;
    }

    this.openDraft('edit');
  },

  async onCancelJoinTap() {
    if (!this.data.isJoined || !this.data.postDetail) {
      return;
    }

    const modalRes = await wx.showModal({
      title: '退出搭子',
      content: '退出后将不再显示联系方式，名额会退回给其他同学。',
      confirmText: '确认退出',
      confirmColor: '#b3262d',
      cancelText: '再想想'
    });

    if (!modalRes.confirm) {
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'cancelJoinPost',
        postId: this.data.postDetail._id
      },
      success: res => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          wx.showToast({ title: (res.result && res.result.message) || '退出失败', icon: 'none' });
          return;
        }

        wx.showToast({ title: '已退出搭子', icon: 'success' });
        this.fetchDetail(this.data.postDetail._id);
      },
      fail: err => {
        wx.hideLoading();
        console.error('退出搭子失败：', err);
        wx.showToast({ title: '退出失败，请重试', icon: 'none' });
      }
    });
  },

  async onDeletePostTap() {
    if (!this.data.isCreator || !this.data.postDetail) {
      return;
    }

    const joinedCount = Array.isArray(this.data.postDetail.joined_users)
      ? this.data.postDetail.joined_users.length
      : 0;
    const modalRes = await wx.showModal({
      title: '确认删除',
      content: joinedCount > 0
        ? `已有 ${joinedCount} 位同学加入，删除后会通知他们。若 24 小时内累计删除 3 次已有同学加入的帖子，会触发发布冷静期，1 小时内不能发布新帖子。`
        : '当前还没有同学加入，删除后这条邀约会从广场同步下架，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#ff4d67',
      cancelText: '取消'
    });

    if (!modalRes.confirm) {
      return;
    }

    wx.showLoading({ title: '删除中...', mask: true });

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: {
        type: 'deletePost',
        postId: this.data.postDetail._id
      },
      success: res => {
        wx.hideLoading();
        if (!res.result || !res.result.success) {
          wx.showToast({ title: (res.result && res.result.message) || '删除失败', icon: 'none' });
          return;
        }

        const result = res.result || {};
        const title = result.joinedCount > 0 ? '已删除并通知' : '删除成功';
        let content = '';
        if (result.joinedCount > 0) {
          content = result.penalty && result.penalty.remainText
            ? `已通知 ${result.notifiedCount || result.joinedCount} 位加入者。你已触发发布冷静期，约 ${result.penalty.remainText} 后可再次发布。`
            : `已通知 ${result.notifiedCount || result.joinedCount} 位加入者。本次未触发发布冷静期。`;
        }

        if (content) {
          wx.showModal({
            title,
            content,
            showCancel: false,
            success: () => {
              wx.navigateBack({
                fail: () => {
                  wx.switchTab({ url: '/pages/mine/mine' });
                }
              });
            }
          });
          return;
        }

        wx.showToast({ title, icon: 'success' });
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: '/pages/mine/mine' });
            }
          });
        }, 500);
      },
      fail: err => {
        wx.hideLoading();
        console.error('删除帖子失败：', err);
        wx.showToast({ title: '删除失败，请重试', icon: 'none' });
      }
    });
  },

  onPullDownRefresh() {
    if (this.postId) {
      this.fetchDetail(this.postId);
    }
    wx.stopPullDownRefresh();
  }
});
