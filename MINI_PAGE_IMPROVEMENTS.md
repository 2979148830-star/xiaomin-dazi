# 个人档案页面改进文档

## 更新日期
2026-05-02

## 概述
本次更新为"我的"页面（pages/mine）增加了昵称唯一性检查、昵称锁定机制以及头像循环切换功能，提升了用户体验和数据一致性。

---

## 主要改进

### 1. 新用户自动分配昵称和头像

**功能描述：**
- 新用户首次进入时，系统会从预设池中随机分配一个昵称和头像
- 预设昵称池：`['民大自习猿', '石榴籽同学', '魏公村守望者']`
- 预设头像池：`['./a1.png', './a2.png', './a3.png']`

**实现位置：**
- `app.js` - `showProfileReminder()` 方法
- `mine.js` - `initUserInfo()` 方法

**用户体验：**
- 避免了新用户无法发布帖子的困扰
- 通过随机分配增加趣味性
- 用户可以随时在"我的"页面修改

---

### 2. 昵称唯一性检查

**功能描述：**
- 保存个人档案前，检查昵称是否已被其他用户占用
- 如果昵称重复，提示用户并阻止保存

**实现逻辑：**
1. 用户点击"保存并开启搭子之旅"按钮
2. 系统检查昵称是否为空
3. 检查性别和年龄是否已填写
4. 通过昵称查询数据库中的其他用户
5. 如果存在同名用户，提示"此昵称已被校友占用"
6. 如果昵称唯一，继续保存流程

**实现位置：**
- `mine.js` - `saveProfile()` 方法

**数据库查询示例：**
```javascript
db.collection('users').where({ user_name: userInfo.nickname }).get({
  success: (res) => {
    if (res.data.length > 0) {
      wx.showToast({ title: '此昵称已被校友占用', icon: 'none' });
      return;
    }
    // 继续保存
  }
});
```

---

### 3. 昵称锁定机制

**功能描述：**
- 用户保存个人档案后，昵称输入框会被锁定（变灰、禁用）
- 封面和详情页显示用户已保存的昵称
- 锁定后无法修改昵称，确保数据一致性

**视觉反馈：**
- 输入框背景变为浅灰色 `#f5f5f5`
- 边框变为浅灰色 `#e0e0e0`
- 文字颜色变为浅灰色 `#999`
- 透明度降低至 0.7
- 光标变为禁止符号
- 占位符颜色变为浅灰色 `#bbb`

**实现位置：**
- `mine.wxml` - 添加 `disabled="{{userInfo.isNicknameSet}}"` 属性
- `mine.wxss` - 添加 `.locked` 样式类

**数据存储：**
- 保存成功后，`isNicknameSet` 字段设置为 `true`
- 同时更新全局数据和本地存储

---

### 4. 头像循环切换功能

**功能描述：**
- 用户可以在保存前循环切换预设头像（a1 → a2 → a3 → a1...）
- 点击头像区域会自动切换下一个头像
- 切换时有平滑动画效果
- 如果昵称已锁定，提示"昵称已锁定，无法切换头像"

**交互逻辑：**
```javascript
cycleAvatar() {
  const { avatarIndex, userInfo } = this.data;
  
  // 如果昵称已锁定，不允许切换头像
  if (userInfo.isNicknameSet) {
    wx.showToast({ title: '昵称已锁定，无法切换头像', icon: 'none' });
    return;
  }
  
  // 循环切换头像
  const nextIndex = (avatarIndex + 1) % this.data.defaultAvatars.length;
  const nextAvatar = this.data.defaultAvatars[nextIndex];
  
  this.setData({
    avatarIndex: nextIndex,
    'userInfo.avatar': nextAvatar
  });
  
  wx.showToast({ title: '已切换头像', icon: 'success' });
}
```

**实现位置：**
- `mine.wxml` - 将头像容器添加 `bindtap="cycleAvatar"` 事件
- `mine.js` - 添加 `cycleAvatar()` 方法
- `mine.wxss` - 添加点击反馈动画效果

---

## 修改的文件

### 1. app.js
**修改内容：**
- 在 `queryUserInfo()` 方法中添加 `isNicknameSet` 字段读取
- 新增 `showProfileReminder()` 方法，为新用户显示欢迎弹窗
- 弹窗引导用户去完善个人档案
- 随机分配默认昵称和头像

**关键代码：**
```javascript
showProfileReminder() {
  const defaultAvatars = ['./a1.png', './a2.png', './a3.png'];
  const defaultNames = ['民大自习猿', '石榴籽同学', '魏公村守望者'];
  const random = Math.floor(Math.random() * defaultAvatars.length);
  
  wx.showModal({
    title: '🎉 欢迎来到小民搭子',
    content: '请先完善个人档案，让我们更好地了解你！\n\n系统已为你随机分配了默认头像和昵称，你可以随时修改哦。',
    confirmText: '去完善',
    confirmColor: '#667eea',
    success: (res) => {
      if (res.confirm) {
        wx.switchTab({ url: '/pages/mine/mine' });
      }
    }
  });
}
```

### 2. mine.js
**修改内容：**
- 添加 `avatarIndex` 状态变量
- 修改 `onChooseAvatar()` 方法，更新 `userInfo.avatar` 而不是 `userAvatar`
- 新增 `cycleAvatar()` 方法实现头像循环切换
- 重构 `saveProfile()` 方法，添加昵称唯一性检查
- 新增 `performSave()` 方法，封装实际保存逻辑
- 在 `isNicknameSet` 字段中添加锁定标记

**关键代码：**
```javascript
// 昵称唯一性检查
saveProfile() {
  const app = getApp();
  const { userInfo } = this.data;
  
  // 校验必填项
  if (!userInfo.nickname) {
    return wx.showToast({ title: '请设置昵称', icon: 'none' });
  }
  if (!userInfo.gender) {
    return wx.showToast({ title: '请选择性别', icon: 'none' });
  }
  if (!userInfo.age) {
    return wx.showToast({ title: '请输入年龄', icon: 'none' });
  }
  
  // 检查昵称唯一性
  const db = wx.cloud.database();
  db.collection('users').where({ user_name: userInfo.nickname }).get({
    success: (res) => {
      if (res.data.length > 0) {
        wx.showToast({ title: '此昵称已被校友占用', icon: 'none' });
        return;
      }
      this.performSave(userInfo, db);
    }
  });
}

// 头像循环切换
cycleAvatar() {
  const { avatarIndex, userInfo } = this.data;
  
  if (userInfo.isNicknameSet) {
    wx.showToast({ title: '昵称已锁定，无法切换头像', icon: 'none' });
    return;
  }
  
  const nextIndex = (avatarIndex + 1) % this.data.defaultAvatars.length;
  const nextAvatar = this.data.defaultAvatars[nextIndex];
  
  this.setData({
    avatarIndex: nextIndex,
    'userInfo.avatar': nextAvatar
  });
  
  wx.showToast({ title: '已切换头像', icon: 'success' });
}
```

### 3. mine.wxml
**修改内容：**
- 将头像按钮包裹在 `avatar-container` 容器中
- 添加 `avatar-tip` 提示文字："点击切换头像"
- 为昵称输入框添加 `disabled` 属性，根据 `isNicknameSet` 状态控制
- 添加 `locked` 样式类，用于显示锁定状态

**关键代码：**
```xml
<!-- 头像部分：点击可循环切换头像，或从相册上传 -->
<view class="avatar-container" bindtap="cycleAvatar">
  <button class="avatar-btn" open-type="chooseAvatar" bind:chooseavatar="onChooseAvatar">
    <view class="avatar-box">
      <image class="avatar" src="{{userInfo.avatar || '/images/default-avatar.png'}}" mode="aspectFill"></image>
    </view>
  </button>
  <view class="avatar-tip">
    <text>点击切换头像</text>
  </view>
</view>

<!-- 昵称输入框 -->
<input 
  class="nickname-input {{userInfo.isNicknameSet ? 'locked' : ''}}" 
  type="nickname" 
  placeholder="点击设置你的昵称" 
  value="{{userInfo.nickname}}" 
  bindinput="onNicknameInput"
  disabled="{{userInfo.isNicknameSet}}"
/>
```

### 4. mine.wxss
**修改内容：**
- 添加 `avatar-container` 样式
- 为 `avatar-box` 添加点击动画效果（缩放和阴影变化）
- 添加 `avatar-tip` 提示样式
- 为 `.locked` 类添加锁定状态的样式
- 改进 `nickname-input` 的过渡效果

**关键代码：**
```css
/* 头像容器 */
.avatar-container {
  display: inline-block;
  text-align: center;
  cursor: pointer;
}

.avatar-box {
  transition: all 0.3s ease;
}

.avatar-container:active .avatar-box {
  transform: scale(0.95);
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.4);
}

/* 头像提示 */
.avatar-tip {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12rpx 24rpx;
  border-radius: 30rpx;
  font-size: 24rpx;
  font-weight: 500;
  box-shadow: 0 4rpx 12rpx rgba(102, 126, 234, 0.3);
}

/* 锁定状态 */
.nickname-input.locked {
  background: #f5f5f5;
  border-color: #e0e0e0;
  color: #999;
  cursor: not-allowed;
  opacity: 0.7;
}

.nickname-input.locked::placeholder {
  color: #bbb;
}
```

---

## 数据库更新

### users 集合新增字段
- `isNicknameSet`: Boolean
  - 默认值: `false`
  - 说明: 标记用户是否已设置昵称（锁定状态）
  - 保存档案后设为 `true`

### users 集合更新字段
- `user_name`: String
  - 新增唯一性约束（通过索引实现）
  - 保存档案时更新
  
- `user_avatar`: String
  - 更新为云存储文件 ID
  - 保存档案时更新

- `update_time`: ServerDate
  - 标记最后更新时间

---

## 数据流程图

### 新用户流程
```
用户首次打开小程序
  ↓
进入"我的"页面
  ↓
查询数据库（未找到用户）
  ↓
随机分配昵称和头像
  ↓
显示昵称、性别、年龄、爱好
  ↓
用户点击头像切换
  ↓
用户编辑信息
  ↓
用户点击"保存并开启搭子之旅"
  ↓
检查昵称唯一性
  ↓
保存到数据库（isNicknameSet: true）
  ↓
更新全局数据
  ↓
更新本地存储
  ↓
完成
```

### 老用户流程
```
用户已设置档案
  ↓
进入"我的"页面
  ↓
从全局数据获取信息
  ↓
显示已保存的昵称（已锁定）
  ↓
用户可以点击头像查看
  ↓
提示"昵称已锁定，无法切换"
  ↓
完成
```

---

## 用户体验改进

### 1. 欢迎引导
- 新用户看到友好的欢迎弹窗
- 随机分配增加趣味性
- 明确告知用户可以修改

### 2. 防错机制
- 昵称唯一性检查避免冲突
- 锁定机制防止误修改
- 友好的错误提示

### 3. 视觉反馈
- 头像切换动画
- 锁定状态清晰可见
- 按钮点击反馈

### 4. 操作便捷
- 点击头像即可切换
- 单键保存，无需多余操作
- 实时数据更新

---

## 测试建议

### 功能测试
1. **新用户测试**
   - [ ] 首次打开页面，确认随机分配的昵称和头像
   - [ ] 确认昵称可以编辑
   - [ ] 点击头像，确认切换功能正常
   - [ ] 完善档案后，确认昵称被锁定
   - [ ] 确认点击头像时提示"昵称已锁定"

2. **昵称唯一性测试**
   - [ ] 设置一个昵称后保存
   - [ ] 修改昵称为相同名称
   - [ ] 确认提示"此昵称已被校友占用"
   - [ ] 修改为其他名称，确认可以保存
   - [ ] 测试多个不同昵称的保存

3. **老用户测试**
   - [ ] 已保存档案的用户打开页面
   - [ ] 确认昵称已锁定
   - [ ] 确认点击头像无反应或提示

### 视觉测试
1. **动画效果**
   - [ ] 点击头像，确认有缩放动画
   - [ ] 锁定状态，确认颜色变化
   - [ ] 所有交互有流畅的过渡

2. **样式一致性**
   - [ ] 检查所有页面的头像显示
   - [ ] 确认锁定状态在不同页面一致

### 数据测试
1. **数据库验证**
   - [ ] 检查 `users` 集合，确认 `isNicknameSet` 字段正确
   - [ ] 检查 `user_name` 是否唯一
   - [ ] 检查 `user_avatar` 是否为云存储文件 ID

2. **全局数据同步**
   - [ ] 保存档案后，刷新页面，确认信息保留
   - [ ] 在其他页面（如发布页）查看用户信息，确认显示正确

---

## 已知限制

1. **昵称修改限制**
   - 当前设计不允许用户修改已锁定的昵称
   - 如果用户想修改，需要清除本地缓存或删除用户记录

2. **头像池限制**
   - 当前只有 3 个预设头像
   - 老用户保存档案后只能上传自定义头像
   - 未保存前只能切换这 3 个预设头像

3. **唯一性检查范围**
   - 当前只检查昵称唯一性
   - 不检查邮箱、手机号等其他唯一标识

---

## 未来改进建议

1. **支持修改昵称**
   - 添加"修改昵称"功能
   - 再次检查唯一性
   - 需要用户身份验证

2. **增加头像选择**
   - 添加更多预设头像
   - 支持上传更多图片

3. **头像池扩展**
   - 从后端获取更多头像选项
   - 支持用户上传自定义头像池

4. **唯一性检查优化**
   - 添加邮箱、手机号等唯一性检查
   - 添加短信验证功能

---

## 相关文档

- [用户档案设置指南](./USERS_SETUP_GUIDE.md)
- [个人档案页面重构指南](./MINE_PAGE_REFACTOR_GUIDE.md)
- [数据库设计文档](./USERS_COLLECTION.md)

---

## 维护者
开发团队

## 最后更新
2026-05-02