Page({
  data: {
    activeTab: 'published',
    publishedPosts: [],
    joinedPosts: [],
    currentList: []
  },

  onLoad(options) {
    const initialTab = options && options.tab === 'joined' ? 'joined' : 'published';
    this.setData({ activeTab: initialTab });
    this.refreshPage();
  },

  onShow() {
    this.refreshPage();
  },

  refreshPage() {
    this.ensureOpenId(() => {
      this.loadMyPosts();
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

  formatPost(post) {
    const isFull = post.status === 'full' || Number(post.total_people) <= 0;
    const initialPeople = Number(post.initial_people || 0);
    const remainPeople = Number(post.total_people || 0);

    return {
      ...post,
      statusText: isFull ? '已满员' : '招募中',
      statusClass: isFull ? 'full' : 'open',
      remainText: isFull ? '名额已满' : `还差 ${remainPeople} 人`,
      displayDate: post.day_label ? `${post.day_label} · ${post.date}` : post.date,
      joinedCount: Math.max(initialPeople - remainPeople, 0)
    };
  },

  applyCurrentList(tab = this.data.activeTab, publishedPosts = this.data.publishedPosts, joinedPosts = this.data.joinedPosts) {
    this.setData({
      activeTab: tab,
      currentList: tab === 'published' ? publishedPosts : joinedPosts
    });
  },

  loadMyPosts() {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type: 'getMyPosts' },
      success: res => {
        if (!res.result || !res.result.success) {
          wx.showToast({ title: '加载失败', icon: 'none' });
          return;
        }

        const publishedPosts = (res.result.publishedPosts || []).map(item => this.formatPost(item));
        const joinedPosts = (res.result.joinedPosts || []).map(item => this.formatPost(item));

        this.setData({
          publishedPosts,
          joinedPosts
        }, () => {
          this.applyCurrentList(this.data.activeTab, publishedPosts, joinedPosts);
        });
      },
      fail: err => {
        console.error('加载我的订单失败:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      },
      complete: () => {
        wx.stopPullDownRefresh();
      }
    });
  },

  switchTab(e) {
    this.applyCurrentList(e.currentTarget.dataset.tab);
  },

  goDetail(e) {
    const postId = e.currentTarget.dataset.id;
    if (!postId) {
      return;
    }

    wx.navigateTo({
      url: `/pkg-extra/detail/detail?id=${postId}`
    });
  },

  callPhone(e) {
    const phoneNumber = String(e.currentTarget.dataset.phone || '');
    if (!phoneNumber) {
      wx.showToast({ title: '暂无联系电话', icon: 'none' });
      return;
    }

    wx.makePhoneCall({
      phoneNumber
    });
  },

  goPublish() {
    wx.switchTab({ url: '/pages/publish/publish' });
  },

  goPlaza() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onPullDownRefresh() {
    this.loadMyPosts();
  }
});
