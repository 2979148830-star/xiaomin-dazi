# 安全合规实现说明

## 📋 概述

本文档详细说明了为"校园灵魂搭子"小程序实现的隐私协议与权限声明功能，符合微信生态合规要求。

---

## 🔐 功能：隐私协议与权限声明

### 1.1 微信配置

#### app.json

```json
{
  "__usePrivacyCheck__": true
}
```

### 1.2 隐私指引页面

#### 页面结构

```
pages/privacy/
├── privacy.wxml   # 隐私指引内容
├── privacy.js     # 逻辑控制
├── privacy.wxss   # 样式
└── privacy.json   # 配置
```

#### 核心功能

1. **首次启动检查**
   - 检查本地存储是否有 `privacyAgreed` 标记
   - 如果未同意，弹出引导页面
   - 用户同意后保存到本地存储

2. **隐私内容包含**
   - 隐私收集说明（昵称、头像、OpenID、帖子信息）
   - 信息使用目的（匹配搭子、展示、安全存储）
   - 数据安全措施（云存储、仅授权可见、不共享）
   - 权限说明（原生头像/昵称选择、手动输入联系方式）
   - 用户权利（查看、删除、拒绝收集）
   - 联系方式

3. **同意/拒绝处理**
   - 同意：保存到本地存储，返回
   - 拒绝：显示引导跳转微信设置页面

### 1.3 代码实现

#### app.js 核心逻辑

```javascript
// 检查隐私协议状态
if (!this.globalData.privacyAgreed) {
  wx.showModal({
    title: '隐私保护',
    content: '我们重视您的隐私保护，请先阅读并同意我们的用户隐私保护指引。',
    confirmText: '去阅读',
    cancelText: '退出',
    success: (res) => {
      if (res.confirm) {
        wx.navigateTo({
          url: '/pages/privacy/privacy'
        });
      } else {
        wx.exitMiniProgram();
      }
    }
  });
}

// 检查隐私协议状态
checkPrivacyAgreement() {
  const agreed = wx.getStorageSync('privacyAgreed');
  this.privacyAgreed = !!agreed;
  
  if (!this.privacyAgreed) {
    wx.showModal({
      title: '隐私保护',
      content: '请先阅读并同意用户隐私保护指引，否则无法使用部分功能。',
      showCancel: false
    });
    return false;
  }
  return true;
}
```

#### privacy.js 核心逻辑

```javascript
onAgree() {
  wx.setStorageSync('privacyAgreed', true);
  wx.navigateBack();
}
```

### 1.4 组件化隐私弹窗（可选）

创建了一个通用的隐私弹窗组件：

```
components/privacyModal/
├── privacyModal.wxml   # 弹窗模板
├── privacyModal.js     # 弹窗逻辑
├── privacyModal.wxss   # 弹窗样式
└── privacyModal.json   # 组件配置
```

**特点**：
- 可复用组件
- 支持自定义内容
- 独立同意/取消逻辑

---

## 📦 部署清单

### 云开发配置

#### 1. 数据库集合

在微信云开发控制台创建以下集合：

| 集合名称 | 权限 |
|---------|------|
| `posts` | 所有用户可读，仅创建者可写 |
| `users` | 仅创建者 |
| `comments` | 所有用户可读，仅创建者可写 |

---

## 🧪 测试步骤

### 隐私协议测试

1. 清除小程序数据（重新编译）
2. 首次启动应弹出隐私指引
3. 查看隐私内容完整性
4. 点击"同意"应保存状态
5. 重新启动应不再弹窗
6. 点击"拒绝"应退出小程序

---

## ⚠️ 重要提示

### 隐私合规注意事项

1. **隐私指引必须真实**：
   - 说明所有收集的信息
   - 说明信息用途
   - 说明安全措施
   - 提供联系方式

2. **用户权利**：
   - 用户有权随时查看自己的个人信息
   - 用户有权删除自己的账号和所有数据
   - 用户有权不同意某些非必要的信息收集

3. **微信审核要求**：
   - 必须在微信公众平台配置隐私指引
   - 提供隐私指引页面链接
   - 确保用户明确同意

---

## 🔗 参考资源

- [小程序隐私保护指引](https://developers.weixin.qq.com/miniprogram/dev/framework/privacy/compliance.html)
- [云开发安全文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)

---

## 📝 更新日志

- 2024年：实现隐私协议与权限声明功能