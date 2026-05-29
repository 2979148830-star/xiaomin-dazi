const DEFAULT_SCORES = () => ({ E: 0, I: 0, T: 0, F: 0, J: 0, P: 0 });
const DEFAULT_FORM_DATA = () => ({
  type: '',
  date: '',
  time: '',
  location: '',
  total_people: '',
  total_people_label: '',
  note: '',
  gender: '',
  customType: '',
  phone: ''
});

const formatDate = date => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const combineDateTime = (dateText, timeText) => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateText || ''));
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timeText || ''));

  if (!dateMatch || !timeMatch) {
    return NaN;
  }

  return new Date(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0
  ).getTime();
};

const QUESTION_SET = [
  {
    title: '刚进一个“今晚有人吗”的新群，你第一反应更像？',
    options: [
      { emoji: '🔥', label: '直接发一句“今晚走不走”把人叫出来', type: 'E', tag: '秒开团局' },
      { emoji: '😎', label: '先丢个表情包试水温，看看谁接梗', type: 'E', tag: '梗图破冰' },
      { emoji: '👀', label: '先翻聊天记录，摸清大家是什么路数', type: 'I', tag: '潜水观察' },
      { emoji: '🎧', label: '先收藏群聊，等真想去的时候再冒泡', type: 'I', tag: '低耗上线' }
    ]
  },
  {
    title: '社团摆摊、音乐节、校园集市这种热闹场子，你更常见的状态是？',
    options: [
      { emoji: '🪩', label: '哪里热闹往哪钻，顺手认识几个新朋友', type: 'E', tag: '人群续航' },
      { emoji: '🎤', label: '听到投缘的话题就会自然接上去聊', type: 'E', tag: '社交接球' },
      { emoji: '📸', label: '先自己逛一圈，确认喜欢再深聊', type: 'I', tag: '慢热深聊' },
      { emoji: '🫶', label: '更想和熟人结伴边逛边吐槽', type: 'I', tag: '熟人舒适' }
    ]
  },
  {
    title: '小组作业刚建群，你最像下面哪一种同学？',
    options: [
      { emoji: '🧠', label: '先把分工、ddl、格式一次排明白', type: 'T', tag: '框架拉满' },
      { emoji: '⚡', label: '先确认目标，效率优先别绕弯', type: 'T', tag: '效率优先' },
      { emoji: '🤝', label: '先看看谁压力大，想办法把气氛稳住', type: 'F', tag: '情绪稳场' },
      { emoji: '🌈', label: '先找大家都舒服的合作节奏', type: 'F', tag: '关系润滑' }
    ]
  },
  {
    title: '搭子临时改时间或改地点时，你下意识会怎么处理？',
    options: [
      { emoji: '🧭', label: '先判断改完还值不值得去，别白折腾', type: 'T', tag: '理性校准' },
      { emoji: '📌', label: '马上给两个备选方案，别让局卡住', type: 'T', tag: '备选很快' },
      { emoji: '☁️', label: '先听对方为什么改，再决定怎么配合', type: 'F', tag: '先听再说' },
      { emoji: '🥤', label: '只要大家不尴尬，弹性一点也没关系', type: 'F', tag: '氛围优先' }
    ]
  },
  {
    title: '一到考试周、ddl 周，你桌面上的人生秩序通常是？',
    options: [
      { emoji: '🗂️', label: 'to do 写满，按表推进才最安心', type: 'J', tag: '日程控场' },
      { emoji: '📍', label: '先锁死最重要的任务，其他再机动补位', type: 'J', tag: '重点先行' },
      { emoji: '🚀', label: '看状态切任务，哪门顺手先冲哪门', type: 'P', tag: '顺手开冲' },
      { emoji: '🛟', label: '留点空档给灵感和临时救火', type: 'P', tag: '弹性回血' }
    ]
  },
  {
    title: '周末本来空着，突然有人约夜骑、citywalk 或看展，你会？',
    options: [
      { emoji: '🧾', label: '先看时间地点预算，合适就立刻定下来', type: 'J', tag: '说走也稳' },
      { emoji: '🎫', label: '能提前订票订座就不拖到最后', type: 'J', tag: '提前落锤' },
      { emoji: '🌪️', label: '当天心情对了就冲，不想做太多预案', type: 'P', tag: '心动即走' },
      { emoji: '🛹', label: '更享受边走边改路线的随机感', type: 'P', tag: '路线随缘' }
    ]
  },
  {
    title: '一群人讨论“今晚吃啥”时，你通常贡献的是哪种能力？',
    options: [
      { emoji: '📊', label: '先看评分、人均和路程，综合最优再说', type: 'T', tag: '信息筛选' },
      { emoji: '🪄', label: '列两个方案投票，尽快拍板别内耗', type: 'T', tag: '快速拍板' },
      { emoji: '🍜', label: '谁最饿谁最赶，就先照顾当下需求', type: 'F', tag: '照顾队友' },
      { emoji: '💛', label: '如果有人特别想吃，那就优先满足情绪值', type: 'F', tag: '情绪加分' }
    ]
  },
  {
    title: '一场搭子局结束后，群里突然安静下来，你更像？',
    options: [
      { emoji: '📣', label: '主动发照片或表情包，把群继续盘活', type: 'E', tag: '售后营业' },
      { emoji: '🎉', label: '顺手再组下一场，不让热度掉线', type: 'E', tag: '二次组局' },
      { emoji: '🌙', label: '默默存照片，有缘下次再见', type: 'I', tag: '安静回味' },
      { emoji: '💬', label: '更愿意私聊真正聊得来的那一个', type: 'I', tag: '私聊深耕' }
    ]
  }
];

Page({
  data: {
    isFinished: false,
    isRetaking: false,
    currentIndex: 0,
    scores: DEFAULT_SCORES(),
    mbtiResult: '',
    finalTag: '',
    selectedAnswerTags: [],
    peopleOptions: [
      { label: '1人', value: 1 },
      { label: '2人', value: 2 },
      { label: '3人', value: 3 },
      { label: '4人', value: 4 },
      { label: '5人', value: 5 },
      { label: '6人', value: 6 },
      { label: '7人', value: 7 },
      { label: '8人', value: 8 },
      { label: '9人', value: 9 },
      { label: '10人以上', value: 10 }
    ],
    typeOptions: [
      { label: '学习', value: '学习' },
      { label: '干饭', value: '干饭' },
      { label: '运动', value: '运动' },
      { label: '游戏', value: '游戏' },
      { label: '聊天', value: '聊天' },
      { label: '散步', value: '散步' },
      { label: '桌游', value: '桌游' },
      { label: '旅游', value: '旅游' },
      { label: '拼单', value: '拼单' },
      { label: '其他', value: '其他' }
    ],
    dateRange: {
      start: '',
      end: ''
    },
    formData: DEFAULT_FORM_DATA(),
    fieldErrors: {},
    draftMode: '',
    draftPostId: '',
    questions: QUESTION_SET
  },

  onLoad() {
    this.initDateRange();
    this.syncPersonaFromGlobal();
  },

  onShow() {
    this.initDateRange();
    this.syncPersonaFromGlobal();
    this.applyStoredDraft();
  },

  initDateRange() {
    const today = new Date();
    const future = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    this.setData({
      dateRange: {
        start: formatDate(today),
        end: formatDate(future)
      }
    });
  },

  syncPersonaFromGlobal() {
    if (this.data.isRetaking) {
      return;
    }

    const app = getApp();
    const hasPersona = app.globalData.userMbti && app.globalData.userMbti !== '???';
    const answerTags = Array.isArray(app.globalData.userAnswerTags) ? app.globalData.userAnswerTags : [];

    if (!hasPersona) {
      this.setData({
        isFinished: false,
        currentIndex: 0,
        scores: DEFAULT_SCORES(),
        mbtiResult: '',
        finalTag: '',
        selectedAnswerTags: []
      });
      return;
    }

    this.setData({
      isFinished: true,
      mbtiResult: app.globalData.userMbti,
      finalTag: app.globalData.userTag || '',
      selectedAnswerTags: answerTags
    });
  },

  applyStoredDraft() {
    const draft = wx.getStorageSync('postDraft');
    if (!draft || !draft.formData) {
      return;
    }

    wx.removeStorageSync('postDraft');
    const totalPeople = Number(draft.formData.total_people || 0);
    const peopleOption = this.data.peopleOptions.find(item => item.value === totalPeople) ||
      this.data.peopleOptions[this.data.peopleOptions.length - 1];

    this.setData({
      isFinished: true,
      formData: {
        ...DEFAULT_FORM_DATA(),
        ...draft.formData,
        total_people: totalPeople || draft.formData.total_people,
        total_people_label: peopleOption ? peopleOption.label : ''
      },
      fieldErrors: {},
      draftMode: draft.mode || '',
      draftPostId: draft.postId || ''
    });

    wx.showToast({
      title: draft.mode === 'edit' ? '已载入编辑内容' : '已复制为草稿',
      icon: 'none'
    });
  },

  chooseOption(e) {
    const { type, tag } = e.currentTarget.dataset;
    const nextScores = {
      ...this.data.scores,
      [type]: (this.data.scores[type] || 0) + 1
    };
    const selectedAnswerTags = [...this.data.selectedAnswerTags, tag];

    if (this.data.currentIndex < this.data.questions.length - 1) {
      this.setData({
        scores: nextScores,
        selectedAnswerTags,
        currentIndex: this.data.currentIndex + 1
      });
      return;
    }

    this.setData({
      scores: nextScores,
      selectedAnswerTags
    }, () => this.calculateResult());
  },

  calculateResult() {
    const s = this.data.scores;
    const l1 = s.E >= s.I ? 'E' : 'I';
    const l2 = s.T >= s.F ? 'T' : 'F';
    const l3 = s.J >= s.P ? 'J' : 'P';
    const mbti = l1 + l2 + l3;
    const tagDict = {
      ETJ: '高效发车官',
      ETP: '局面破冰手',
      EFJ: '校园组织者',
      EFP: '松弛小太阳',
      ITJ: '稳定靠谱搭',
      ITP: '冷静解题者',
      IFJ: '温柔后勤位',
      IFP: '灵感漫游者'
    };
    const answerTags = this.data.selectedAnswerTags.filter(Boolean);
    const tag = tagDict[mbti] || '神秘搭子';

    getApp().saveMbtiTest(mbti, tag, answerTags);
    this.setData({
      isFinished: true,
      isRetaking: false,
      mbtiResult: mbti,
      finalTag: tag,
      selectedAnswerTags: answerTags
    });
  },

  restartQuiz() {
    wx.showModal({
      title: '重新测一遍',
      content: '重新测一遍后，新的搭子画像会覆盖现在这套结果。',
      confirmText: '开始重测',
      success: res => {
        if (!res.confirm) {
          return;
        }

        this.setData({
          isFinished: false,
          isRetaking: true,
          currentIndex: 0,
          scores: DEFAULT_SCORES(),
          mbtiResult: '',
          finalTag: '',
          selectedAnswerTags: []
        });
      }
    });
  },

  onTypeChange(e) {
    const selected = this.data.typeOptions[e.detail.value];
    this.setData({
      'formData.type': selected.value,
      'formData.customType': selected.value === '其他' ? this.data.formData.customType : ''
    });
    this.clearFieldError('type');
    this.clearFieldError('customType');
  },

  onDateChange(e) {
    this.setData({ 'formData.date': e.detail.value });
    this.clearFieldError('date');
    this.clearFieldError('time');
  },

  onTimeChange(e) {
    this.setData({ 'formData.time': e.detail.value });
    this.clearFieldError('time');
  },

  onGenderChange(e) {
    this.setData({ 'formData.gender': ['男生', '女生', '男女都行'][e.detail.value] });
    this.clearFieldError('gender');
  },

  onPeopleChange(e) {
    const selected = this.data.peopleOptions[Number(e.detail.value)] || this.data.peopleOptions[0];
    this.setData({
      'formData.total_people': selected.value,
      'formData.total_people_label': selected.label
    });
    this.clearFieldError('total_people');
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`formData.${field}`]: e.detail.value });
    this.clearFieldError(field);
  },

  clearFieldError(field) {
    if (!field || !this.data.fieldErrors[field]) {
      return;
    }

    this.setData({
      [`fieldErrors.${field}`]: ''
    });
  },

  getFinalType() {
    const f = this.data.formData;
    return f.type === '其他' ? (f.customType || '').trim() : f.type;
  },

  validateEventTime() {
    const { date, time } = this.data.formData;
    const eventTimestamp = combineDateTime(date, time);
    const currentMinuteStart = Math.floor(Date.now() / 60000) * 60000;

    if (!Number.isFinite(eventTimestamp)) {
      return { field: 'time', message: '请选择有效的日期和时间' };
    }

    if (eventTimestamp < currentMinuteStart) {
      return { field: 'time', message: '不能发布已经过去的时间' };
    }

    return null;
  },

  validateForm() {
    const f = this.data.formData;
    const app = getApp();

    if (!app.globalData.openid) {
      wx.showToast({ title: '请稍候，正在获取用户信息...', icon: 'loading', duration: 2000 });
      return false;
    }

    if (!app.globalData.hasUserInfo || !app.globalData.userInfo.gender) {
      wx.showModal({
        title: '请先完善资料',
        content: '发布搭子前需要先在“我的”页面确认微信昵称、头像和性别。',
        confirmText: '去完善',
        success: res => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/mine/mine' });
          }
        }
      });
      return false;
    }

    const fieldErrors = {};
    let firstField = '';
    const setFieldError = (field, message) => {
      if (!fieldErrors[field]) {
        fieldErrors[field] = message;
      }
      if (!firstField) {
        firstField = field;
      }
    };

    if (!f.type || !f.type.trim()) {
      setFieldError('type', '请选择搭子类型');
    }

    if (f.type === '其他' && !this.getFinalType()) {
      setFieldError('customType', '请填写具体的其他类型');
    }

    if (!f.location || !f.location.trim()) {
      setFieldError('location', '请输入约定地点');
    }

    if (!f.date) {
      setFieldError('date', '请选择日期');
    }

    if (!f.time) {
      setFieldError('time', '请选择具体时间');
    }

    if (f.date && f.time) {
      const timeError = this.validateEventTime();
      if (timeError) {
        setFieldError(timeError.field, timeError.message);
      }
    }

    if (!f.total_people || f.total_people < 1) {
      setFieldError('total_people', '请选择需要几个人');
    }

    if (!f.gender) {
      setFieldError('gender', '请选择性别要求');
    }

    const phoneRegex = /^\d{11}$/;
    if (!f.phone || !phoneRegex.test(f.phone)) {
      setFieldError('phone', '请输入 11 位数字电话');
    }

    this.setData({ fieldErrors });

    if (firstField) {
      this.scrollToField(firstField);
      return false;
    }

    return true;
  },

  scrollToField(field) {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery();
      query.select(`#field-${field}`).boundingClientRect();
      query.selectViewport().scrollOffset();
      query.exec(res => {
        const rect = res && res[0];
        const viewport = res && res[1];
        if (!rect) {
          return;
        }

        wx.pageScrollTo({
          scrollTop: Math.max((viewport ? viewport.scrollTop : 0) + rect.top - 80, 0),
          duration: 240
        });
      });
    });
  },

  resetForm() {
    this.setData({
      formData: DEFAULT_FORM_DATA(),
      fieldErrors: {},
      draftMode: '',
      draftPostId: ''
    });
  },

  backToEditDetail() {
    const postId = this.data.draftPostId;
    this.resetForm();

    if (!postId) {
      wx.switchTab({ url: '/pages/mine/mine' });
      return;
    }

    wx.navigateTo({
      url: `/pkg-extra/detail/detail?id=${postId}`
    });
  },

  submitPost() {
    if (!this.validateForm()) {
      return;
    }

    const f = this.data.formData;
    const app = getApp();
    const finalType = this.getFinalType();
    const userInfo = app.globalData.userInfo || {};
    const isEditing = this.data.draftMode === 'edit';

    wx.showLoading({ title: '发布中...' });

    const requestData = {
      type: isEditing ? 'updatePost' : 'createPost',
      post: {
        category: f.type,
        type: finalType,
        custom_type: f.type === '其他' ? finalType : '',
        date: f.date,
        time: f.time,
        location: f.location.trim(),
        note: (f.note || '').trim(),
        gender: f.gender,
        creator_name: userInfo.nickname || '民大同学',
        creator_avatar: userInfo.avatar || '',
        creator_tag: app.globalData.userTag || this.data.finalTag,
        creator_mbti: app.globalData.userMbti || this.data.mbtiResult,
        creator_gender: userInfo.gender || '',
        creator_hobbies: userInfo.hobbies || '',
        creator_answer_tags: userInfo.answerTags || app.globalData.userAnswerTags || this.data.selectedAnswerTags,
        total_people: Number(f.total_people)
      },
      phone: f.phone
    };

    if (isEditing) {
      requestData.postId = this.data.draftPostId;
    }

    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: requestData,
      success: res => {
        if (!res.result || !res.result.success) {
          wx.hideLoading();
          const resultMessage = (res.result && res.result.message) || '发布失败，请稍后重试';
          const maybeOldCloudFunction = resultMessage.includes('今天和明天');
          wx.showModal({
            title: '发布失败',
            content: maybeOldCloudFunction
              ? '云函数版本较旧，请在开发者工具里重新上传云函数后再试。'
              : resultMessage,
            showCancel: false
          });
          return;
        }

        wx.hideLoading();
        const successTitle = isEditing ? '修改已保存' : '已同步至广场';
        this.resetForm();
        wx.showToast({
          title: successTitle,
          icon: 'success',
          duration: 2000
        });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1500);
      },
      fail: err => {
        console.error('发布失败详情:', err);
        wx.hideLoading();

        let errorMsg = '发布失败';
        if (err.errMsg) {
          if (err.errMsg.includes('permission')) {
            errorMsg = '权限不足，请检查数据库权限设置';
          } else if (err.errMsg.includes('database')) {
            errorMsg = '数据库错误，请稍后重试';
          } else if (err.errMsg.includes('network')) {
            errorMsg = '网络错误，请检查网络连接';
          } else {
            errorMsg = err.errMsg;
          }
        }

        wx.showModal({
          title: '发布失败',
          content: `${errorMsg}\n请截图保存错误信息`,
          showCancel: false
        });
      }
    });
  }
});
