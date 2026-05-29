Page({
  onAgree() {
    wx.setStorageSync('privacyAgreed', true);
    const app = getApp();
    app.privacyAgreed = true;
    app.globalData.privacyAgreed = true;
    if (!app.globalData.openid) {
      app.getOpenId();
    }

    wx.navigateBack();
  }
});
